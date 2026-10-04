import { describe, expect, it } from 'vitest';
import { MIGRATIONS, migrate, MigrationError } from '../src/db/migrations.js';
import { Db } from '../src/db/sqlite.js';

const fresh = (): Db => {
  const db = new Db(':memory:');
  migrate(db);
  return db;
};

describe('migrate', () => {
  it('creates the schema once and does nothing the second time', () => {
    const db = new Db(':memory:');
    expect(migrate(db)).toBe(MIGRATIONS.length);
    expect(migrate(db)).toBe(0);
    const tables = db
      .all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
      )
      .map((row) => row.name);
    expect(tables).toEqual([
      'event_days',
      'events',
      'marks',
      'participants',
      'schema_migrations',
    ]);
  });

  it('refuses a migration that changed after it was applied', () => {
    const db = new Db(':memory:');
    migrate(db);
    const edited = MIGRATIONS.map((m) => ({
      ...m,
      sql: `${m.sql}\n-- edited`,
    }));
    expect(() => migrate(db, edited)).toThrow(MigrationError);
  });

  it('refuses a database newer than the code', () => {
    const db = new Db(':memory:');
    migrate(db);
    db.run(
      'INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (99, ?, 0)',
      'x'
    );
    expect(() => migrate(db)).toThrow(/does not know/);
  });

  it('upgrades a v1 database to all eight languages without losing events, people or marks', () => {
    const db = new Db(':memory:');
    migrate(db, [MIGRATIONS[0]!]);
    db.run(
      `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
       VALUES ('old', 'h', 'Existing event', 'owl', 'de', 1, 0, 0, '2027-04-01')`
    );
    db.run(
      "INSERT INTO event_days (event_id, day, added_at) VALUES ('old', '2027-03-06', 0)"
    );
    db.run(
      "INSERT INTO participants (id, event_id, name, name_key, source, created_at) VALUES ('p', 'old', 'Max', 'max', 'self', 0)"
    );
    db.run("INSERT INTO marks VALUES ('p', 'old', '2027-03-06', 'yes')");

    expect(migrate(db)).toBe(1);
    expect(db.get<{ language: string }>('SELECT language FROM events')).toEqual(
      {
        language: 'de',
      }
    );
    expect(db.all('SELECT * FROM event_days')).toHaveLength(1);
    expect(db.all('SELECT * FROM participants')).toHaveLength(1);
    expect(db.all('SELECT * FROM marks')).toHaveLength(1);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({
      foreign_keys: 1,
    });
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('spanish', 'h', 'Partido', 'soccer', 'es', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('french', 'h', 'Match', 'soccer', 'fr', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('portuguese', 'h', 'Jogo', 'soccer', 'pt', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('italian', 'h', 'Partita', 'soccer', 'it', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('japanese', 'h', '試合', 'soccer', 'ja', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('dutch', 'h', 'Wedstrijd', 'soccer', 'nl', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(() =>
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('danish', 'h', 'Kamp', 'soccer', 'da', 1, 0, 0, '2027-04-01')`
      )
    ).toThrow();
    expect(() =>
      db.run(
        "INSERT INTO event_days (event_id, day, added_at) VALUES ('missing', '2027-03-07', 0)"
      )
    ).toThrow();
    expect(migrate(db)).toBe(0);
  });

  it('restores foreign-key checks and rolls back a failed table rebuild', () => {
    const db = new Db(':memory:');
    migrate(db, [MIGRATIONS[0]!]);
    db.run(
      `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
       VALUES ('old', 'h', 'Existing event', 'owl', 'en', 1, 0, 0, '2027-04-01')`
    );
    const broken = [
      MIGRATIONS[0]!,
      { ...MIGRATIONS[1]!, sql: 'DROP TABLE events; INVALID SQL;' },
    ];
    expect(() => migrate(db, broken)).toThrow();
    expect(db.all('SELECT id FROM events')).toEqual([{ id: 'old' }]);
    expect(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({
      foreign_keys: 1,
    });
    expect(migrate(db)).toBe(1);
  });

  it('enforces the schema rules', () => {
    const db = fresh();
    const insert = (
      title: string,
      finalStart: string | null,
      closedAt: number | null
    ) =>
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days,
           created_at, last_write_at, expires_on, final_start, final_end, closed_at)
         VALUES (?, 'h', ?, 'owl', 'en', 1, 0, 0, '2027-01-01', ?, ?, ?)`,
        `id${title.length}${finalStart ?? ''}${closedAt ?? ''}`,
        title,
        finalStart,
        finalStart,
        closedAt
      );
    expect(() => insert('', null, null)).toThrow();
    expect(() => insert('x'.repeat(81), null, null)).toThrow();
    // A chosen date needs a closed poll.
    expect(() => insert('ok', '2027-03-06', null)).toThrow();
    expect(insert('ok', '2027-03-06', 1)).toBe(1);
  });

  it('refuses a mark on a day that is not a candidate', () => {
    const db = fresh();
    db.run(
      `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
       VALUES ('e', 'h', 't', 'owl', 'en', 1, 0, 0, '2027-01-01')`
    );
    db.run(
      "INSERT INTO event_days (event_id, day, added_at) VALUES ('e', '2027-03-06', 0)"
    );
    db.run(
      "INSERT INTO participants (id, event_id, name, name_key, source, created_at) VALUES ('p', 'e', 'Max', 'max', 'self', 0)"
    );
    expect(
      db.run("INSERT INTO marks VALUES ('p', 'e', '2027-03-06', 'yes')")
    ).toBe(1);
    expect(() =>
      db.run("INSERT INTO marks VALUES ('p', 'e', '2027-03-07', 'yes')")
    ).toThrow();
    // Removing the day takes its marks along.
    db.run("DELETE FROM event_days WHERE day = '2027-03-06'");
    expect(db.all('SELECT * FROM marks')).toEqual([]);
  });
});

describe('Db.tx', () => {
  it('commits on return and rolls back on a throw', () => {
    const db = new Db(':memory:');
    db.exec('CREATE TABLE t (v INTEGER) STRICT');
    db.tx(() => db.run('INSERT INTO t VALUES (1)'));
    expect(() =>
      db.tx(() => {
        db.run('INSERT INTO t VALUES (2)');
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(db.all<{ v: number }>('SELECT v FROM t').map((r) => r.v)).toEqual([
      1,
    ]);
  });

  it('joins an outer transaction instead of nesting', () => {
    const db = new Db(':memory:');
    db.exec('CREATE TABLE t (v INTEGER) STRICT');
    expect(() =>
      db.tx(() => {
        db.tx(() => db.run('INSERT INTO t VALUES (1)'));
        throw new Error('outer fails');
      })
    ).toThrow('outer fails');
    expect(db.all('SELECT v FROM t')).toEqual([]);
  });

  it('refuses an async function, rolling back what it did', () => {
    const db = new Db(':memory:');
    db.exec('CREATE TABLE t (v INTEGER) STRICT');
    expect(() =>
      db.tx(() => {
        db.run('INSERT INTO t VALUES (1)');
        return Promise.resolve();
      })
    ).toThrow(/must not be async/);
    expect(db.all('SELECT v FROM t')).toEqual([]);
  });

  it('closes twice without complaint', () => {
    const db = new Db(':memory:');
    db.checkpoint();
    db.close();
    expect(() => db.close()).not.toThrow();
  });
});
