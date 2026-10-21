import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { migrate } from '../src/db/migrations.js';
import {
  countEvents,
  deleteEvent,
  deleteParticipant,
  insertEvent,
  insertParticipant,
  updateEvent,
} from '../src/db/repo.js';
import { CHECKPOINT_RETRY_MS, Db } from '../src/db/sqlite.js';
import {
  adminHeaders,
  createEvent,
  eventBody,
  FakeClock,
  join as joinEvent,
  mark,
  setStatus,
  testApp,
  WEEKEND,
  type TestApp,
  patchParticipant,
  participantOf,
} from './helpers.js';

let dir: string;
const opened: Db[] = [];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'owl-storage-'));
});
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const open = (path: string): Db => {
  const db = new Db(path);
  opened.push(db);
  return db;
};

const NOW = Date.UTC(2027, 2, 1, 12);
const ID = 'AAAAAAAAAAAA';

const seed = (db: Db, description: string | null = null): void => {
  migrate(db);
  insertEvent(
    db,
    {
      id: ID,
      adminHash: 'h',
      title: 'Summer tournament',
      description,
      location: null,
      emoji: 'owl',
      creatorName: null,
      language: 'en',
      durationDays: 1,
      minCount: null,
      days: ['2027-03-06', '2027-03-07'],
      roster: [],
    },
    NOW
  );
};

let people = 0;
const person = (db: Db, name: string) =>
  insertParticipant(
    db,
    ID,
    {
      id: `P${String((people += 1)).padStart(11, '0')}`,
      name,
      nameKey: name.toLowerCase(),
      passwordHash: null,
    },
    NOW
  );

/** Everything the database has put on disk: the file and its log. */
const bytesOnDisk = (path: string): string =>
  [path, `${path}-wal`]
    .map((file) => {
      try {
        return readFileSync(file).toString('latin1');
      } catch {
        return '';
      }
    })
    .join('');

const mode = (path: string): number => statSync(path).mode & 0o777;

describe('file permissions', () => {
  it('keep the database, its log and its index to the owner', () => {
    const path = join(dir, 'owl.db');
    const db = open(path);
    seed(db);
    expect(mode(path)).toBe(0o600);
    expect(mode(`${path}-wal`)).toBe(0o600);
    expect(mode(`${path}-shm`)).toBe(0o600);
  });

  it('tighten files that an earlier run left open to everyone', () => {
    const path = join(dir, 'owl.db');
    const first = open(path);
    seed(first);
    chmodSync(path, 0o644);
    chmodSync(`${path}-wal`, 0o644);
    chmodSync(`${path}-shm`, 0o644);
    const second = open(path);
    expect(mode(path)).toBe(0o600);
    expect(mode(`${path}-wal`)).toBe(0o600);
    expect(mode(`${path}-shm`)).toBe(0o600);
    expect(second.get('SELECT 1 AS one')).toEqual({ one: 1 });
  });

  it('tighten an existing database file with no log beside it', () => {
    const path = join(dir, 'owl.db');
    writeFileSync(path, '', { mode: 0o644 });
    chmodSync(path, 0o644);
    open(path);
    expect(mode(path)).toBe(0o600);
  });

  it('leave an in-memory database alone', () => {
    expect(() => open(':memory:')).not.toThrow();
    expect(() => open('')).not.toThrow();
  });
});

describe('what a deletion leaves in the files', () => {
  it('holds no trace of a removed participant', () => {
    const path = join(dir, 'owl.db');
    const db = open(path);
    seed(db);
    const marked = person(db, 'ZZQXMARKER');
    person(db, 'Ana');
    expect(bytesOnDisk(path)).toContain('ZZQXMARKER');
    deleteParticipant(db, ID, marked.id, NOW);
    expect(bytesOnDisk(path)).not.toContain('ZZQXMARKER');
    expect(bytesOnDisk(path)).toContain('Ana');
  });

  it.each(['title', 'description', 'location', 'creatorName'] as const)(
    'holds no trace of a %s that was rewritten',
    (field) => {
      const path = join(dir, 'owl.db');
      const db = open(path);
      seed(db, 'Call 0123456789');
      updateEvent(db, ID, { [field]: 'ZZQXOLD' }, NOW);
      expect(bytesOnDisk(path)).toContain('ZZQXOLD');
      updateEvent(db, ID, { [field]: field === 'title' ? 'New' : null }, NOW);
      expect(bytesOnDisk(path)).not.toContain('ZZQXOLD');
    }
  );

  it('folds the log in when a text is taken out', () => {
    const path = join(dir, 'owl.db');
    const db = open(path);
    seed(db, 'Call 0123456789');
    updateEvent(db, ID, { description: null }, NOW);
    expect(bytesOnDisk(path)).not.toContain('0123456789');
    expect(statSync(`${path}-wal`).size).toBe(0);
  });

  it('checkpoints only for a person or a text, not for days, marks or nothing', () => {
    const db = open(join(dir, 'owl.db'));
    seed(db);
    const max = person(db, 'Max');
    const spy = vi.spyOn(db, 'checkpoint');
    updateEvent(db, ID, {}, NOW);
    updateEvent(db, ID, { emoji: 'owl', durationDays: 1, minCount: null }, NOW);
    updateEvent(db, ID, { days: ['2027-03-06', '2027-03-08'] }, NOW);
    expect(spy).not.toHaveBeenCalled();
    updateEvent(db, ID, { title: 'Same title' }, NOW);
    expect(spy).toHaveBeenCalledTimes(1);
    deleteParticipant(db, ID, max.id, NOW);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('waits for the outer transaction when it is one step of a larger one', () => {
    const db = open(join(dir, 'owl.db'));
    seed(db);
    const max = person(db, 'Max');
    const spy = vi.spyOn(db, 'checkpoint');
    db.tx(() => deleteParticipant(db, ID, max.id, NOW));
    expect(spy).not.toHaveBeenCalled();
  });

  it('still succeeds when a reader keeps the log from being truncated', () => {
    const path = join(dir, 'owl.db');
    const db = open(path);
    seed(db);
    db.exec('PRAGMA busy_timeout = 50');
    const max = person(db, 'Max');
    const reader = open(path);
    reader.exec('BEGIN');
    reader.get('SELECT count(*) FROM participants');
    // The delete is committed; only the checkpoint reports that it is busy.
    deleteParticipant(db, ID, max.id, NOW);
    expect(db.get('SELECT 1 FROM participants WHERE id = ?', max.id)).toBe(
      undefined
    );
    expect(db.checkpoint(50)).toBe(false);
    reader.exec('COMMIT');
    expect(db.checkpoint()).toBe(true);
  });
});

describe('checkpoint waiting', () => {
  it('gives up after its own wait and restores the timeout', () => {
    const path = join(dir, 'owl.db');
    const db = open(path);
    seed(db);
    const reader = open(path);
    reader.exec('BEGIN');
    reader.get('SELECT count(*) FROM participants');
    deleteParticipant(db, ID, person(db, 'Max').id, NOW);
    const started = Date.now();
    expect(db.checkpoint(0)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(db.get<{ timeout: number }>('PRAGMA busy_timeout')?.timeout).toBe(
      5000
    );
    reader.exec('COMMIT');
    expect(db.checkpoint(0)).toBe(true);
  });
});

describe('a checkpoint a reader held up', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A database with a reader holding the log, and a person just deleted. */
  const held = (file = 'owl.db') => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const path = join(dir, file);
    const db = open(path);
    seed(db);
    const max = person(db, 'Max');
    const reader = open(path);
    reader.exec('BEGIN');
    reader.get('SELECT count(*) FROM participants');
    return { path, db, reader, max };
  };

  it('is tried again in the background, and folds the log in once the reader is gone', () => {
    const { path, db, reader, max } = held();
    const started = Date.now();
    deleteParticipant(db, ID, max.id, NOW);
    // The request itself does not wait for the reader.
    expect(Date.now() - started).toBeLessThan(1000);
    expect(vi.getTimerCount()).toBe(1);
    expect(statSync(`${path}-wal`).size).toBeGreaterThan(0);
    reader.exec('COMMIT');
    vi.advanceTimersByTime(CHECKPOINT_RETRY_MS[0]!);
    expect(statSync(`${path}-wal`).size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps retrying, with longer pauses, while the reader stays', () => {
    const { db, reader, max } = held();
    const spy = vi.spyOn(db, 'checkpoint');
    deleteParticipant(db, ID, max.id, NOW);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(CHECKPOINT_RETRY_MS[0]! - 1);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(CHECKPOINT_RETRY_MS[1]!);
    expect(spy).toHaveBeenCalledTimes(3);
    reader.exec('COMMIT');
    vi.advanceTimersByTime(CHECKPOINT_RETRY_MS[2]!);
    expect(spy).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is scheduled once, however many requests were held up', () => {
    const { db, reader, max } = held();
    deleteParticipant(db, ID, max.id, NOW);
    updateEvent(db, ID, { title: 'Other title' }, NOW);
    updateEvent(db, ID, { title: 'Yet another' }, NOW);
    expect(vi.getTimerCount()).toBe(1);
    reader.exec('COMMIT');
  });

  it('is dropped when a later request gets through, and when the database closes', () => {
    const { db, reader, max } = held();
    deleteParticipant(db, ID, max.id, NOW);
    expect(vi.getTimerCount()).toBe(1);
    reader.exec('COMMIT');
    expect(db.requestCheckpoint()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    const second = held('second.db');
    deleteParticipant(second.db, ID, second.max.id, NOW);
    expect(vi.getTimerCount()).toBe(1);
    second.db.close();
    expect(vi.getTimerCount()).toBe(0);
    second.reader.exec('COMMIT');
  });

  it('starts over with the short pause after one that succeeded', () => {
    const { db, reader, max } = held();
    const spy = vi.spyOn(db, 'checkpoint');
    deleteParticipant(db, ID, max.id, NOW);
    vi.advanceTimersByTime(CHECKPOINT_RETRY_MS[0]!);
    reader.exec('COMMIT');
    vi.advanceTimersByTime(CHECKPOINT_RETRY_MS[1]!);
    expect(vi.getTimerCount()).toBe(0);
    // Held up again: the pause is the first one, not the third.
    const again = open(join(dir, 'owl.db'));
    again.exec('BEGIN');
    again.get('SELECT count(*) FROM participants');
    updateEvent(db, ID, { title: 'New title' }, NOW);
    const calls = spy.mock.calls.length;
    vi.advanceTimersByTime(CHECKPOINT_RETRY_MS[0]!);
    expect(spy.mock.calls.length).toBe(calls + 1);
    again.exec('COMMIT');
  });
});

describe('what a changed participant leaves in the files', () => {
  let path: string;
  let db: Db;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let id: string;
  let adminToken: string;

  // The real application on a file database, so that the log is there to read.
  beforeEach(async () => {
    path = join(dir, 'owl.db');
    db = open(path);
    migrate(db);
    app = await buildApp({
      config: loadConfig({
        PUBLIC_URL: 'https://owl.example.org',
        RATE_LIMIT_MULTIPLIER: '1000',
      }),
      db,
      secret: Buffer.alloc(32, 7),
      clock: new FakeClock(),
      logStream: { write: () => undefined },
      heartbeatMs: 60_000,
    });
    ({ id, adminToken } = await createEvent(app));
  });
  afterEach(async () => {
    await app.close();
  });

  const asSelf = (who: { token: string }) => ({
    'x-participant-token': who.token,
  });

  /** The files, in lower case: the name key is stored that way. */
  const disk = (): string => bytesOnDisk(path).toLowerCase();

  const stored = (pid: string) =>
    db.get<{ name: string; note: string | null }>(
      'SELECT name, note FROM participants WHERE id = ?',
      pid
    );

  it.each(['self', 'organiser'] as const)(
    'holds no trace of the name and the note that %s rewrote',
    async (actor) => {
      const max = await joinEvent(app, id, 'Zzqxold');
      const headers = actor === 'self' ? asSelf(max) : adminHeaders(adminToken);
      expect(
        (
          await patchParticipant(app, id, max.participantId, headers, {
            note: 'Call 0123456789',
          })
        ).statusCode
      ).toBe(200);
      expect(disk()).toContain('zzqxold');
      expect(disk()).toContain('0123456789');

      const response = await patchParticipant(
        app,
        id,
        max.participantId,
        headers,
        {
          name: 'Zzqxnew',
          note: 'Call 9876543210',
        }
      );
      expect(response.statusCode).toBe(200);
      expect(disk()).not.toContain('zzqxold');
      expect(disk()).not.toContain('0123456789');
      expect(disk()).toContain('zzqxnew');
      expect(disk()).toContain('9876543210');
      // Folded in, not left in the log.
      expect(statSync(`${path}-wal`).size).toBe(0);
    }
  );

  it.each([[''], [null]])(
    'holds no trace of a note that was cleared to %j',
    async (cleared) => {
      const max = await joinEvent(app, id, 'Max');
      await patchParticipant(app, id, max.participantId, asSelf(max), {
        note: 'Call 0123456789',
      });
      expect(disk()).toContain('0123456789');
      const response = await patchParticipant(
        app,
        id,
        max.participantId,
        asSelf(max),
        {
          note: cleared,
        }
      );
      expect(response.statusCode).toBe(200);
      expect((await participantOf(app, id, max.participantId)).note).toBeNull();
      expect(disk()).not.toContain('0123456789');
      expect(stored(max.participantId)?.note).toBeNull();
    }
  );

  it('holds no trace of a name that was only recased', async () => {
    const max = await joinEvent(app, id, 'ZzqxCase');
    // Case-sensitive on purpose: the name key is lower case and stays.
    expect(bytesOnDisk(path)).toContain('ZzqxCase');
    const response = await patchParticipant(
      app,
      id,
      max.participantId,
      asSelf(max),
      {
        name: 'ZZQXCASE',
      }
    );
    expect(response.statusCode).toBe(200);
    expect((await participantOf(app, id, max.participantId)).name).toBe(
      'ZZQXCASE'
    );
    expect(bytesOnDisk(path)).not.toContain('ZzqxCase');
    expect(bytesOnDisk(path)).toContain('ZZQXCASE');
  });

  describe('folds the log in', () => {
    let spy: MockInstance<Db['checkpoint']>;
    beforeEach(() => {
      spy = vi.spyOn(db, 'checkpoint');
    });

    it.each([
      ['a rename', { name: 'Moritz' }],
      ['a note', { note: 'Back at six' }],
      ['a note taken out', { note: null }],
      ['an empty note', { note: '' }],
      ['a rename and a note', { name: 'Moritz', note: 'Back at six' }],
      [
        'a note with a new password',
        { note: 'Back at six', password: 'secret-1' },
      ],
    ])('once for %s', async (_, payload) => {
      const max = await joinEvent(app, id, 'Max');
      const response = await patchParticipant(
        app,
        id,
        max.participantId,
        asSelf(max),
        payload
      );
      expect(response.statusCode).toBe(200);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('after the transaction, not inside it', async () => {
      const max = await joinEvent(app, id, 'Max');
      const inside: boolean[] = [];
      spy.mockImplementation(function (this: Db) {
        inside.push(this.inTransaction);
        return true;
      });
      await patchParticipant(app, id, max.participantId, asSelf(max), {
        note: 'Back at six',
      });
      expect(inside).toEqual([false]);
    });
  });

  describe('does not fold the log in', () => {
    let spy: MockInstance<Db['checkpoint']>;
    beforeEach(() => {
      spy = vi.spyOn(db, 'checkpoint');
    });

    it('for a change of the password alone, or for nothing at all', async () => {
      const max = await joinEvent(app, id, 'Max');
      const password = await patchParticipant(
        app,
        id,
        max.participantId,
        asSelf(max),
        {
          password: 'secret-1',
        }
      );
      expect(password.statusCode).toBe(200);
      const removed = await patchParticipant(
        app,
        id,
        max.participantId,
        adminHeaders(adminToken),
        {
          password: null,
        }
      );
      expect(removed.statusCode).toBe(200);
      expect(
        (
          await patchParticipant(
            app,
            id,
            max.participantId,
            adminHeaders(adminToken),
            {}
          )
        ).statusCode
      ).toBe(200);
      expect(spy).not.toHaveBeenCalled();
    });

    it('for a name that is taken, and leaves the entry as it was', async () => {
      const max = await joinEvent(app, id, 'Max');
      await joinEvent(app, id, 'Ana');
      const response = await patchParticipant(
        app,
        id,
        max.participantId,
        asSelf(max),
        {
          name: 'ana',
          note: 'Back at six',
        }
      );
      expect(response.statusCode).toBe(409);
      expect(stored(max.participantId)).toEqual({ name: 'Max', note: null });
      expect(spy).not.toHaveBeenCalled();
    });

    it('for a closed poll, a wrong token or a body that does not fit', async () => {
      const max = await joinEvent(app, id, 'Max');
      const ana = await joinEvent(app, id, 'Ana');
      expect(
        (
          await patchParticipant(app, id, max.participantId, asSelf(ana), {
            note: 'Mine now',
          })
        ).statusCode
      ).toBe(403);
      expect(
        (
          await patchParticipant(app, id, max.participantId, asSelf(max), {
            nickname: 'Maxi',
          })
        ).statusCode
      ).toBe(400);
      expect(
        (
          await patchParticipant(app, id, max.participantId, asSelf(max), {
            note: 'x'.repeat(141),
          })
        ).statusCode
      ).toBe(400);
      expect(
        (await setStatus(app, id, adminToken, { status: 'closed' })).statusCode
      ).toBe(200);
      const closed = await patchParticipant(
        app,
        id,
        max.participantId,
        asSelf(max),
        {
          name: 'Moritz',
          note: 'Back at six',
        }
      );
      expect(closed.statusCode).toBe(409);
      expect(stored(max.participantId)).toEqual({ name: 'Max', note: null });
      expect(spy).not.toHaveBeenCalled();
    });

    it('for an unknown person', async () => {
      const response = await patchParticipant(
        app,
        id,
        'NOSUCHPERSON',
        adminHeaders(adminToken),
        {
          note: 'Back at six',
        }
      );
      expect(response.statusCode).toBe(404);
      expect(spy).not.toHaveBeenCalled();
    });
  });
});

describe('Db.checkpoint and Db.sizeBytes', () => {
  it('report true on a database with nothing to fold in', () => {
    const db = open(':memory:');
    expect(db.checkpoint()).toBe(true);
    migrate(db);
    expect(db.checkpoint()).toBe(true);
  });

  /** What the file is made of: all its pages, and those on the free list. */
  const layout = (db: Db): { pages: number; free: number; size: number } => ({
    pages: Number(
      db.get<{ page_count: number }>('PRAGMA page_count')!.page_count
    ),
    free: Number(
      db.get<{ freelist_count: number }>('PRAGMA freelist_count')!
        .freelist_count
    ),
    size: Number(db.get<{ page_size: number }>('PRAGMA page_size')!.page_size),
  });

  it('measure pages in use times the page size, growing with the data', () => {
    const path = join(dir, 'owl.db');
    const db = open(path);
    // An empty database has at most the one page of its header.
    expect(db.sizeBytes()).toBeLessThanOrEqual(4096);
    seed(db);
    db.checkpoint();
    // The file holds the pages in use and, besides, the ones on the free list
    // (the migrations leave a few behind).
    const fresh = layout(db);
    expect(db.sizeBytes()).toBe((fresh.pages - fresh.free) * fresh.size);
    expect(db.sizeBytes() + fresh.free * fresh.size).toBe(statSync(path).size);
    const small = db.sizeBytes();
    for (let i = 0; i < 400; i += 1)
      person(db, `Person number ${i} with a long name`);
    db.checkpoint();
    expect(db.sizeBytes()).toBeGreaterThan(small);
    const grown = layout(db);
    expect(db.sizeBytes() + grown.free * grown.size).toBe(statSync(path).size);
  });

  it('does not count the free list, which a deletion fills and nothing empties', () => {
    const path = join(dir, 'owl.db');
    const db = open(path);
    migrate(db);
    db.checkpoint();
    const empty = db.sizeBytes();
    for (let i = 0; i < 200; i += 1) {
      const id = `E${String(i).padStart(11, '0')}`;
      insertEvent(
        db,
        {
          id,
          adminHash: 'h',
          title: `Event number ${i}`,
          description: 'x'.repeat(400),
          location: null,
          emoji: 'owl',
          creatorName: null,
          language: 'en',
          durationDays: 1,
          minCount: null,
          days: ['2027-03-06', '2027-03-07'],
          roster: [],
        },
        NOW
      );
    }
    const full = db.sizeBytes();
    const peak = layout(db).pages;
    expect(countEvents(db)).toBe(200);
    expect(full).toBeGreaterThan(empty);
    for (let i = 0; i < 200; i += 1) {
      deleteEvent(db, `E${String(i).padStart(11, '0')}`);
    }
    db.checkpoint();
    expect(countEvents(db)).toBe(0);
    // The file keeps its pages, the measure does not.
    expect(layout(db).pages).toBe(peak);
    expect(layout(db).free).toBeGreaterThan(0);
    expect(db.sizeBytes()).toBeLessThan(full);
    expect(db.sizeBytes()).toBeLessThanOrEqual(empty + 2 * layout(db).size);
    // And a free page is used again before the file grows.
    insertEvent(
      db,
      {
        id: 'AAAAAAAAAAAA',
        adminHash: 'h',
        title: 'Again',
        description: null,
        location: null,
        emoji: 'owl',
        creatorName: null,
        language: 'en',
        durationDays: 1,
        minCount: null,
        days: ['2027-03-06'],
        roster: [],
      },
      NOW
    );
    expect(layout(db).pages).toBe(peak);
  });

  it('is nonzero for a migrated in-memory database', () => {
    const db = open(':memory:');
    migrate(db);
    expect(db.sizeBytes()).toBeGreaterThan(0);
  });
});

describe('the ceiling on the size of the database', () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.app.close();
    t = undefined;
  });

  const create = (app: TestApp['app']) =>
    app.inject({ method: 'POST', url: '/api/events', payload: eventBody() });

  it('takes events without a ceiling', async () => {
    t = await testApp();
    expect(t.config.maxDbBytes).toBeNull();
    for (let i = 0; i < 3; i += 1) {
      expect((await create(t.app)).statusCode).toBe(201);
    }
  });

  it('refuses a new event with 503 once the database has reached it', async () => {
    t = await testApp();
    const size = t.db.sizeBytes();
    // A ceiling of exactly the size now: the next event is refused.
    t.config.maxDbBytes = size;
    const refused = await create(t.app);
    expect(refused.statusCode).toBe(503);
    expect(refused.json().error).toBe('capacity');
    // One byte more room and it is taken.
    t.config.maxDbBytes = size + 1;
    expect((await create(t.app)).statusCode).toBe(201);
  });

  it('refuses a new event from a database with nothing in it but a tiny ceiling', async () => {
    t = await testApp({ env: { MAX_DB_BYTES: '1' } });
    expect((await create(t.app)).statusCode).toBe(503);
  });

  /** Fill the instance with events that have people on them. */
  const fill = async (app: TestApp['app'], count: number) => {
    const made: { id: string; adminToken: string }[] = [];
    for (let i = 0; i < count; i += 1) {
      const event = await createEvent(app, {
        title: `Event number ${i}`,
        description: 'x'.repeat(400),
      });
      for (const name of ['Ana', 'Ben', 'Cleo']) {
        const who = await joinEvent(app, event.id, name);
        await mark(app, event.id, who, WEEKEND);
      }
      made.push(event);
    }
    return made;
  };

  const wipe = async (
    app: TestApp['app'],
    events: { id: string; adminToken: string }[]
  ) => {
    for (const { id, adminToken } of events) {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/events/${id}`,
        headers: adminHeaders(adminToken),
      });
      expect(response.statusCode).toBe(204);
    }
  };

  it('takes events again once the ones that filled it are deleted', async () => {
    t = await testApp();
    const empty = t.db.sizeBytes();
    const events = await fill(t.app, 30);
    const peak = t.db.sizeBytes();
    expect(peak).toBeGreaterThan(empty);
    t.config.maxDbBytes = peak;
    const refused = await create(t.app);
    expect(refused.statusCode).toBe(503);
    expect(refused.json().error).toBe('capacity');

    await wipe(t.app, events);
    expect(countEvents(t.db)).toBe(0);
    // The file keeps its pages; what counts is what is in use.
    expect(t.db.sizeBytes()).toBeLessThan(peak);
    expect((await create(t.app)).statusCode).toBe(201);
  });

  it('keeps its boundary on a database with free pages: at the size is full, one byte more is room', async () => {
    t = await testApp();
    await wipe(t.app, await fill(t.app, 30));
    expect(countEvents(t.db)).toBe(0);
    const size = t.db.sizeBytes();
    t.config.maxDbBytes = size;
    expect((await create(t.app)).statusCode).toBe(503);
    t.config.maxDbBytes = size + 1;
    expect((await create(t.app)).statusCode).toBe(201);
  });

  it('is not in the way of an instance with no ceiling, before or after a wipe', async () => {
    t = await testApp();
    expect(t.config.maxDbBytes).toBeNull();
    const events = await fill(t.app, 4);
    expect((await create(t.app)).statusCode).toBe(201);
    await wipe(t.app, events);
    expect((await create(t.app)).statusCode).toBe(201);
  });

  it('stops events once a full one has filled it, but keeps serving the ones there', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    t.config.maxDbBytes = t.db.sizeBytes() + 1;
    // Fill the event up: many people, each marked on the weekend.
    for (let i = 0; i < 60; i += 1) {
      const who = await joinEvent(t.app, id, `Person with a long name ${i}`);
      await mark(t.app, id, who, WEEKEND);
    }
    expect((await create(t.app)).statusCode).toBe(503);
    const read = await t.app.inject({
      method: 'GET',
      url: `/api/events/${id}`,
    });
    expect(read.statusCode).toBe(200);
    const again = await joinEvent(t.app, id, 'Late joiner');
    expect((await mark(t.app, id, again, WEEKEND)).statusCode).toBe(200);
  });
});
