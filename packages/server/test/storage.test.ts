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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from '../src/db/migrations.js';
import {
  deleteParticipant,
  insertEvent,
  insertParticipant,
  updateEvent,
} from '../src/db/repo.js';
import { Db } from '../src/db/sqlite.js';
import {
  createEvent,
  eventBody,
  join as joinEvent,
  mark,
  testApp,
  WEEKEND,
  type TestApp,
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
    expect(db.checkpoint()).toBe(false);
    reader.exec('COMMIT');
    expect(db.checkpoint()).toBe(true);
  });
});

describe('Db.checkpoint and Db.sizeBytes', () => {
  it('report true on a database with nothing to fold in', () => {
    const db = open(':memory:');
    expect(db.checkpoint()).toBe(true);
    migrate(db);
    expect(db.checkpoint()).toBe(true);
  });

  it('measure pages in use times the page size, growing with the data', () => {
    const db = open(join(dir, 'owl.db'));
    // An empty database has at most the one page of its header.
    expect(db.sizeBytes()).toBeLessThanOrEqual(4096);
    seed(db);
    db.checkpoint();
    // The size is what the file holds: the same figure as on disk.
    expect(db.sizeBytes()).toBe(statSync(join(dir, 'owl.db')).size);
    const small = db.sizeBytes();
    for (let i = 0; i < 400; i += 1)
      person(db, `Person number ${i} with a long name`);
    db.checkpoint();
    expect(db.sizeBytes()).toBeGreaterThan(small);
    expect(db.sizeBytes()).toBe(statSync(join(dir, 'owl.db')).size);
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
