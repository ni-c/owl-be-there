import {
  addDays,
  utcDateOf,
  diffDays,
  expiresOn,
  todayUTC,
  type EmojiKey,
  type EventStatusData,
  type EventSnapshotData,
  type ISODate,
  type Language,
  type ParticipantViewData,
} from '@owl/shared';
import type { Db } from './sqlite.js';

/*
 * Every query the server makes. Synchronous throughout: the driver is, and a
 * write transaction must never span an `await` (see `Db.tx`).
 */

export interface EventRow {
  id: string;
  admin_hash: string;
  title: string;
  description: string | null;
  location: string | null;
  emoji: string;
  creator_name: string | null;
  language: Language;
  duration_days: number;
  min_count: number | null;
  closed_at: number | null;
  final_start: string | null;
  final_end: string | null;
  created_at: number;
  last_write_at: number;
  expires_on: string;
  version: number;
}

export interface ParticipantRow {
  id: string;
  event_id: string;
  name: string;
  name_key: string;
  source: 'roster' | 'self';
  password_hash: string | null;
  token_gen: number;
  note: string | null;
  marks_at: number | null;
  rev: number;
  created_at: number;
}

interface DayRow {
  day: string;
  added_at: number;
}

interface MarkRow {
  participant_id: string;
  day: string;
  state: 'yes' | 'maybe';
}

export function statusOf(
  row: Pick<EventRow, 'closed_at' | 'final_start'>
): EventStatusData {
  if (row.final_start !== null) return 'finalized';
  return row.closed_at !== null ? 'closed' : 'open';
}

export function countEvents(db: Db): number {
  return db.get<{ n: number }>('SELECT count(*) AS n FROM events')!.n;
}

export function getEvent(db: Db, id: string): EventRow | undefined {
  return db.get<EventRow>('SELECT * FROM events WHERE id = ?', id);
}

export function getDays(db: Db, eventId: string): DayRow[] {
  return db.all<DayRow>(
    'SELECT day, added_at FROM event_days WHERE event_id = ? ORDER BY day',
    eventId
  );
}

export function getParticipant(
  db: Db,
  eventId: string,
  participantId: string
): ParticipantRow | undefined {
  return db.get<ParticipantRow>(
    'SELECT * FROM participants WHERE id = ? AND event_id = ?',
    participantId,
    eventId
  );
}

export function findParticipantByKey(
  db: Db,
  eventId: string,
  nameKey: string
): ParticipantRow | undefined {
  return db.get<ParticipantRow>(
    'SELECT * FROM participants WHERE event_id = ? AND name_key = ?',
    eventId,
    nameKey
  );
}

export function countParticipants(db: Db, eventId: string): number {
  return db.get<{ n: number }>(
    'SELECT count(*) AS n FROM participants WHERE event_id = ?',
    eventId
  )!.n;
}

function marksOf(
  db: Db,
  eventId: string,
  participantId: string
): { yes: string[]; maybe: string[] } {
  const rows = db.all<MarkRow>(
    'SELECT participant_id, day, state FROM marks WHERE participant_id = ? AND event_id = ? ORDER BY day',
    participantId,
    eventId
  );
  return {
    yes: rows.filter((row) => row.state === 'yes').map((row) => row.day),
    maybe: rows.filter((row) => row.state === 'maybe').map((row) => row.day),
  };
}

/** A participant as the API shows them. */
function participantView(
  row: ParticipantRow,
  days: readonly DayRow[],
  marks: { yes: string[]; maybe: string[] }
): ParticipantViewData {
  const answeredAt = row.marks_at;
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    source: row.source,
    answered: answeredAt !== null,
    hasPassword: row.password_hash !== null,
    rev: row.rev,
    yes: marks.yes,
    maybe: marks.maybe,
    unseen:
      answeredAt === null
        ? []
        : days.filter((day) => day.added_at > answeredAt).map((day) => day.day),
  };
}

/** One participant as the API shows them, without building the whole snapshot. */
export function participantViewOf(
  db: Db,
  eventId: string,
  row: ParticipantRow
): ParticipantViewData {
  return participantView(
    row,
    getDays(db, eventId),
    marksOf(db, eventId, row.id)
  );
}

/** How many events keep their last snapshot in memory. */
const SNAPSHOT_CACHE_SIZE = 32;

interface CachedSnapshot {
  version: number;
  data: EventSnapshotData;
}

/**
 * The latest snapshot of each event, least recently used dropped first, per
 * database. Building one reads every participant and every mark, and the same
 * state is read over and over — by the group's browsers, by link previews.
 */
const snapshots = new WeakMap<Db, Map<string, CachedSnapshot>>();

/**
 * Everything about an event that anyone with the link may see.
 *
 * The same object is returned until the event changes, so callers must not
 * modify it. Every write moves `events.version` on, and the cache is keyed by
 * it; an event that is gone is never answered from the cache.
 */
export function snapshot(db: Db, id: string): EventSnapshotData | null {
  const cache = snapshots.get(db) ?? new Map<string, CachedSnapshot>();
  snapshots.set(db, cache);
  const event = getEvent(db, id);
  if (!event) {
    cache.delete(id);
    return null;
  }
  const hit = cache.get(id);
  if (hit?.version === event.version) {
    cache.delete(id);
    cache.set(id, hit);
    return hit.data;
  }
  const data = buildSnapshot(db, event);
  cache.delete(id);
  // Inside a transaction the version may still roll back to a number that a
  // later commit reuses for other data: only committed states are kept.
  if (!db.inTransaction) {
    cache.set(id, { version: event.version, data });
    if (cache.size > SNAPSHOT_CACHE_SIZE)
      cache.delete(cache.keys().next().value!);
  }
  return data;
}

/** The snapshot of an event as the database holds it now, cache aside. */
export function buildSnapshot(db: Db, event: EventRow): EventSnapshotData {
  const id = event.id;
  const days = getDays(db, id);
  const participants = db.all<ParticipantRow>(
    'SELECT * FROM participants WHERE event_id = ? ORDER BY created_at, rowid',
    id
  );
  const marks = db.all<MarkRow>(
    'SELECT participant_id, day, state FROM marks WHERE event_id = ? ORDER BY day',
    id
  );
  const byParticipant = new Map<string, { yes: string[]; maybe: string[] }>();
  for (const participant of participants) {
    byParticipant.set(participant.id, { yes: [], maybe: [] });
  }
  for (const mark of marks) {
    byParticipant.get(mark.participant_id)?.[mark.state].push(mark.day);
  }
  return {
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      emoji: event.emoji as EmojiKey,
      creatorName: event.creator_name,
      language: event.language,
      durationDays: event.duration_days,
      minCount: event.min_count,
      status: statusOf(event),
      finalStart: event.final_start,
      finalEnd: event.final_end,
      expiresOn: event.expires_on,
      version: event.version,
      days: days.map((day) => day.day),
    },
    participants: participants.map((participant) =>
      participantView(participant, days, byParticipant.get(participant.id)!)
    ),
  };
}

/**
 * Record a change: the version moves on, and the event's life is measured
 * from today again. Every write calls this inside its transaction; no read
 * ever does.
 */
function touch(db: Db, eventId: string, now: number): number {
  const event = getEvent(db, eventId)!;
  const lastDay = db.get<{ day: string }>(
    'SELECT max(day) AS day FROM event_days WHERE event_id = ?',
    eventId
  )!.day;
  const answered =
    db.get(
      'SELECT 1 FROM participants WHERE event_id = ? AND marks_at IS NOT NULL LIMIT 1',
      eventId
    ) !== undefined;
  const expires = expiresOn({
    lastWriteDay: todayUTC(new Date(now)),
    lastCandidateDay: lastDay,
    finalEnd: event.final_end,
    answered,
  });
  // Nothing reads last_write_at (expires_on carries the retention date), but
  // the column is NOT NULL and an applied migration is never edited: it stays.
  db.run(
    'UPDATE events SET version = version + 1, last_write_at = ?, expires_on = ? WHERE id = ?',
    now,
    expires,
    eventId
  );
  return event.version + 1;
}

export interface NewEvent {
  id: string;
  adminHash: string;
  title: string;
  description: string | null;
  location: string | null;
  emoji: EmojiKey;
  creatorName: string | null;
  language: Language;
  durationDays: number;
  minCount: number | null;
  days: readonly ISODate[];
  roster: readonly NewParticipant[];
}

export interface NewParticipant {
  id: string;
  name: string;
  nameKey: string;
}

export function insertEvent(db: Db, event: NewEvent, now: number): void {
  db.tx(() => {
    const expires = expiresOn({
      lastWriteDay: todayUTC(new Date(now)),
      lastCandidateDay: event.days[event.days.length - 1]!,
      finalEnd: null,
      // Names on the roster have not answered.
      answered: false,
    });
    db.run(
      `INSERT INTO events (id, admin_hash, title, description, location, emoji,
        creator_name, language, duration_days, min_count, created_at,
        last_write_at, expires_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      event.id,
      event.adminHash,
      event.title,
      event.description,
      event.location,
      event.emoji,
      event.creatorName,
      event.language,
      event.durationDays,
      event.minCount,
      now,
      now,
      expires
    );
    for (const day of event.days) {
      db.run(
        'INSERT INTO event_days (event_id, day, added_at) VALUES (?, ?, ?)',
        event.id,
        day,
        now
      );
    }
    insertRoster(db, event.id, event.roster, now);
  });
}

function insertRoster(
  db: Db,
  eventId: string,
  entries: readonly NewParticipant[],
  now: number
): number {
  let added = 0;
  for (const entry of entries) {
    added += db.run(
      `INSERT INTO participants (id, event_id, name, name_key, source, created_at)
       VALUES (?, ?, ?, ?, 'roster', ?)
       ON CONFLICT (event_id, name_key) DO NOTHING`,
      entry.id,
      eventId,
      entry.name,
      entry.nameKey,
      now
    );
  }
  return added;
}

/** Add names to the organiser's list; names already present are skipped. */
export function addRoster(
  db: Db,
  eventId: string,
  entries: readonly NewParticipant[],
  now: number
): number {
  return db.tx(() => {
    const added = insertRoster(db, eventId, entries, now);
    if (added > 0) touch(db, eventId, now);
    return added;
  });
}

export function insertParticipant(
  db: Db,
  eventId: string,
  participant: NewParticipant & { passwordHash: string | null },
  now: number
): ParticipantRow {
  return db.tx(() => {
    db.run(
      `INSERT INTO participants (id, event_id, name, name_key, source, password_hash, created_at)
       VALUES (?, ?, ?, ?, 'self', ?, ?)`,
      participant.id,
      eventId,
      participant.name,
      participant.nameKey,
      participant.passwordHash,
      now
    );
    touch(db, eventId, now);
    return getParticipant(db, eventId, participant.id)!;
  });
}

export type MarksResult =
  | { ok: true; rev: number; version: number }
  | { ok: false; rev: number; yes: string[]; maybe: string[] };

/**
 * Replace a participant's marks with a complete new set — if the caller saw
 * the latest one.
 *
 * The client always sends the whole set, so repeating a save is harmless, and
 * `baseRev` makes a late or retried request harmless too: it carries an old
 * revision and is refused instead of overwriting something newer. The refusal
 * hands back the current state, so the client can decide what wins.
 */
export function replaceMarks(
  db: Db,
  eventId: string,
  participantId: string,
  baseRev: number,
  yes: readonly ISODate[],
  maybe: readonly ISODate[],
  now: number
): MarksResult {
  return db.tx(() => {
    const participant = getParticipant(db, eventId, participantId)!;
    if (participant.rev !== baseRev) {
      return {
        ok: false,
        rev: participant.rev,
        ...marksOf(db, eventId, participantId),
      };
    }
    db.run(
      'DELETE FROM marks WHERE participant_id = ? AND event_id = ?',
      participantId,
      eventId
    );
    for (const [days, state] of [
      [yes, 'yes'],
      [maybe, 'maybe'],
    ] as const) {
      for (const day of days) {
        db.run(
          'INSERT INTO marks (participant_id, event_id, day, state) VALUES (?, ?, ?, ?)',
          participantId,
          eventId,
          day,
          state
        );
      }
    }
    db.run(
      'UPDATE participants SET rev = rev + 1, marks_at = ? WHERE id = ? AND event_id = ?',
      now,
      participantId,
      eventId
    );
    const version = touch(db, eventId, now);
    return { ok: true, rev: participant.rev + 1, version };
  });
}

export interface ParticipantPatch {
  name?: { name: string; nameKey: string };
  note?: string | null;
  /** A new hash, null to remove the password, absent to leave it. */
  passwordHash?: string | null;
}

export function updateParticipant(
  db: Db,
  eventId: string,
  participantId: string,
  patch: ParticipantPatch,
  now: number
): ParticipantRow {
  return db.tx(() => {
    if (patch.name) {
      db.run(
        'UPDATE participants SET name = ?, name_key = ? WHERE id = ? AND event_id = ?',
        patch.name.name,
        patch.name.nameKey,
        participantId,
        eventId
      );
    }
    if (patch.note !== undefined) {
      db.run(
        'UPDATE participants SET note = ? WHERE id = ? AND event_id = ?',
        patch.note === '' ? null : patch.note,
        participantId,
        eventId
      );
    }
    if (patch.passwordHash !== undefined) {
      // Every change to the password revokes every token issued before it.
      db.run(
        'UPDATE participants SET password_hash = ?, token_gen = token_gen + 1 WHERE id = ? AND event_id = ?',
        patch.passwordHash,
        participantId,
        eventId
      );
    }
    touch(db, eventId, now);
    return getParticipant(db, eventId, participantId)!;
  });
}

export function deleteParticipant(
  db: Db,
  eventId: string,
  participantId: string,
  now: number
): void {
  db.tx(() => {
    db.run(
      'DELETE FROM participants WHERE id = ? AND event_id = ?',
      participantId,
      eventId
    );
    touch(db, eventId, now);
  });
  scrub(db);
}

/**
 * Make removed text really leave the files. `secure_delete` zeroes it in the
 * new page images, but in WAL mode the old images stay in the log and in the
 * database file until a checkpoint overwrites them; a change that took a name
 * or a text out must not wait for one. Inside a larger transaction nothing is
 * written yet, so there is nothing to fold in.
 */
function scrub(db: Db): void {
  if (!db.inTransaction) db.checkpoint();
}

export interface EventPatch {
  title?: string;
  description?: string | null;
  location?: string | null;
  emoji?: EmojiKey;
  creatorName?: string | null;
  durationDays?: number;
  minCount?: number | null;
  days?: readonly ISODate[];
}

const COLUMNS: Record<Exclude<keyof EventPatch, 'days'>, string> = {
  title: 'title',
  description: 'description',
  location: 'location',
  emoji: 'emoji',
  creatorName: 'creator_name',
  durationDays: 'duration_days',
  minCount: 'min_count',
};

/**
 * Change an event's details and candidate days.
 *
 * Removed days take every mark on them along (the foreign key does it).
 * Added days are stamped with the moment they arrived, so everyone who
 * answered before sees them as new rather than as days they said no to. A
 * chosen date that no longer fits — a day of it removed, or the duration
 * changed — is dropped, and the poll stays closed; one that still fits ends
 * where the new duration says.
 */
export function updateEvent(
  db: Db,
  eventId: string,
  patch: EventPatch,
  now: number
): void {
  db.tx(() => {
    for (const [key, column] of Object.entries(COLUMNS) as [
      Exclude<keyof EventPatch, 'days'>,
      string,
    ][]) {
      const value = patch[key];
      if (value === undefined) continue;
      db.run(`UPDATE events SET ${column} = ? WHERE id = ?`, value, eventId);
    }
    if (patch.days) {
      const wanted = new Set(patch.days);
      const current = getDays(db, eventId).map((row) => row.day);
      const removed = current.filter((day) => !wanted.has(day));
      if (removed.length > 0) {
        // Whoever loses marks with a removed day gets a new revision, so their
        // other devices take the server's marks instead of resending the old.
        db.run(
          `UPDATE participants SET rev = rev + 1
           WHERE event_id = ? AND id IN (
             SELECT participant_id FROM marks
             WHERE event_id = ? AND day IN (SELECT value FROM json_each(?))
           )`,
          eventId,
          eventId,
          JSON.stringify(removed)
        );
      }
      for (const day of current) {
        if (!wanted.has(day)) {
          db.run(
            'DELETE FROM event_days WHERE event_id = ? AND day = ?',
            eventId,
            day
          );
        }
      }
      const existing = new Set(current);
      for (const day of patch.days) {
        if (!existing.has(day)) {
          db.run(
            'INSERT INTO event_days (event_id, day, added_at) VALUES (?, ?, ?)',
            eventId,
            day,
            now
          );
        }
      }
    }
    const event = getEvent(db, eventId)!;
    if (event.final_start !== null) {
      if (blockFits(db, event, event.final_start)) {
        // The block still fits, but its end follows the duration.
        db.run(
          'UPDATE events SET final_end = ? WHERE id = ?',
          addDays(event.final_start, event.duration_days - 1),
          eventId
        );
      } else {
        db.run(
          'UPDATE events SET final_start = NULL, final_end = NULL WHERE id = ?',
          eventId
        );
      }
    }
    touch(db, eventId, now);
  });
  if (TEXT_FIELDS.some((key) => patch[key] !== undefined)) scrub(db);
}

/** The details that are free text: a rewrite leaves the old words behind. */
const TEXT_FIELDS = [
  'title',
  'description',
  'location',
  'creatorName',
] as const;

/** The last day `addDays` can reach. */
const LAST_DAY = '9999-12-31';

/** Whether `start` begins a block of the event's duration made of candidate days. */
export function blockFits(
  db: Db,
  event: Pick<EventRow, 'id' | 'duration_days'>,
  start: ISODate
): boolean {
  // `addDays` throws past the end of the calendar; a block that would reach
  // beyond it cannot be made of candidate days.
  if (diffDays(start, LAST_DAY) < event.duration_days - 1) return false;
  const end = addDays(start, event.duration_days - 1);
  const count = db.get<{ n: number }>(
    'SELECT count(*) AS n FROM event_days WHERE event_id = ? AND day BETWEEN ? AND ?',
    event.id,
    start,
    end
  )!.n;
  return count === diffDays(start, end) + 1;
}

export function setStatus(
  db: Db,
  eventId: string,
  status: 'open' | 'closed' | { start: ISODate; end: ISODate },
  now: number
): void {
  db.tx(() => {
    if (status === 'open') {
      db.run(
        'UPDATE events SET closed_at = NULL, final_start = NULL, final_end = NULL WHERE id = ?',
        eventId
      );
    } else if (status === 'closed') {
      db.run(
        'UPDATE events SET closed_at = coalesce(closed_at, ?), final_start = NULL, final_end = NULL WHERE id = ?',
        now,
        eventId
      );
    } else {
      db.run(
        'UPDATE events SET closed_at = coalesce(closed_at, ?), final_start = ?, final_end = ? WHERE id = ?',
        now,
        status.start,
        status.end,
        eventId
      );
    }
    touch(db, eventId, now);
  });
}

export function deleteEvent(db: Db, eventId: string): boolean {
  return db.tx(() => db.run('DELETE FROM events WHERE id = ?', eventId) > 0);
}

/**
 * How many events one write transaction deletes. The driver is synchronous: a
 * transaction that deletes thousands of events holds the write lock, and with
 * it the process's only thread, for seconds, and another process waiting for
 * that lock (the command line against a running server) can run out of patience.
 */
const DELETE_CHUNK = 200;

/**
 * Delete every event whose last day has passed (`expires_on < today`: on the
 * last day itself it still exists); return their ids.
 */
export function sweepExpired(db: Db, today: ISODate): string[] {
  const deleted: string[] = [];
  for (;;) {
    // Looked up again for every chunk: an event that was extended in between
    // is no longer expired.
    const ids = db.tx(() => {
      const chunk = db
        .all<{ id: string }>(
          'SELECT id FROM events WHERE expires_on < ? LIMIT ?',
          today,
          DELETE_CHUNK
        )
        .map((row) => row.id);
      for (const id of chunk) db.run('DELETE FROM events WHERE id = ?', id);
      return chunk;
    });
    deleted.push(...ids);
    if (ids.length < DELETE_CHUNK) return deleted;
  }
}

export interface EventListing {
  id: string;
  title: string;
  created: string;
  participants: number;
}

/**
 * Events created on or after a day, newest first, with how many people
 * answered — those with marks saved; a name the organiser typed into the
 * roster or somebody joined under does not count until it has marked a day.
 * For an operator looking into a flood of new events.
 */
export function listEvents(db: Db, since: ISODate | null): EventListing[] {
  const from = since === null ? 0 : utcDateOf(since).getTime();
  return db.all<EventListing>(
    `SELECT e.id, e.title,
            strftime('%Y-%m-%dT%H:%M:%SZ', e.created_at / 1000, 'unixepoch') AS created,
            (SELECT count(*) FROM participants p WHERE p.event_id = e.id AND p.marks_at IS NOT NULL) AS participants
     FROM events e WHERE e.created_at >= ? ORDER BY e.created_at DESC`,
    from
  );
}

/** The events created on or after a day that nobody has joined, by id. */
export function emptyEventIds(db: Db, since: ISODate): string[] {
  return listEvents(db, since)
    .filter((event) => event.participants === 0)
    .map((event) => event.id);
}

/** Delete events created on or after a day that nobody answered; return their ids. */
export function purgeEmpty(db: Db, since: ISODate): string[] {
  const candidates = emptyEventIds(db, since);
  const deleted: string[] = [];
  for (let from = 0; from < candidates.length; from += DELETE_CHUNK) {
    db.tx(() => {
      for (const id of candidates.slice(from, from + DELETE_CHUNK)) {
        // Somebody may have answered since the list was made.
        const changes = db.run(
          `DELETE FROM events WHERE id = ? AND NOT EXISTS (
             SELECT 1 FROM participants p
             WHERE p.event_id = events.id AND p.marks_at IS NOT NULL)`,
          id
        );
        if (changes > 0) deleted.push(id);
      }
    });
  }
  return deleted;
}

export function stats(db: Db): {
  events: number;
  participants: number;
  marks: number;
} {
  return db.get<{ events: number; participants: number; marks: number }>(
    `SELECT (SELECT count(*) FROM events) AS events,
            (SELECT count(*) FROM participants) AS participants,
            (SELECT count(*) FROM marks) AS marks`
  )!;
}
