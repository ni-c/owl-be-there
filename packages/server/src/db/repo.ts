import {
  addDays,
  diffDays,
  expiresOn,
  todayUTC,
  type EmojiKey,
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
  language: string;
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

export type EventStatus = 'open' | 'closed' | 'finalized';

export function statusOf(
  row: Pick<EventRow, 'closed_at' | 'final_start'>
): EventStatus {
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
export function participantView(
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

/** Everything about an event that anyone with the link may see. */
export function snapshot(db: Db, id: string): EventSnapshotData | null {
  const event = getEvent(db, id);
  if (!event) return null;
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
      language: event.language as Language,
      durationDays: event.duration_days,
      minCount: event.min_count,
      status: statusOf(event),
      finalStart: event.final_start,
      finalEnd: event.final_end,
      createdAt: event.created_at,
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
  const expires = expiresOn({
    lastWriteDay: todayUTC(new Date(now)),
    lastCandidateDay: lastDay,
    finalEnd: event.final_end,
  });
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
 * changed — is dropped, and the poll stays closed.
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
      db.run(
        `UPDATE events SET ${column} = ? WHERE id = ?`,
        value === '' ? null : value,
        eventId
      );
    }
    if (patch.days) {
      const wanted = new Set(patch.days);
      const current = getDays(db, eventId).map((row) => row.day);
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
    if (
      event.final_start !== null &&
      !blockFits(db, event, event.final_start)
    ) {
      db.run(
        'UPDATE events SET final_start = NULL, final_end = NULL WHERE id = ?',
        eventId
      );
    }
    touch(db, eventId, now);
  });
}

/** Whether `start` begins a block of the event's duration made of candidate days. */
export function blockFits(
  db: Db,
  event: Pick<EventRow, 'id' | 'duration_days'>,
  start: ISODate
): boolean {
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

/** Delete every event whose last day has passed; return their ids. */
export function sweepExpired(db: Db, today: ISODate): string[] {
  return db.tx(() => {
    const ids = db
      .all<{ id: string }>('SELECT id FROM events WHERE expires_on < ?', today)
      .map((row) => row.id);
    if (ids.length > 0)
      db.run('DELETE FROM events WHERE expires_on < ?', today);
    return ids;
  });
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
