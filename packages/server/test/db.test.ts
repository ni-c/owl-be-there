import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addDays,
  blockFits,
  diffDays,
  LANGUAGES,
  LAST_DAY,
  LIMITS,
  nameKey,
  utcDateOf,
} from '@owl/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { savingImpact } from '../../client/src/lib/dayEdit.ts';
import {
  MIGRATIONS,
  migrate,
  MigrationError,
  pendingMigrations,
} from '../src/db/migrations.js';
import {
  emptyEventIds,
  findParticipantByKey,
  getDays,
  getEvent,
  getParticipant,
  listEvents,
  participantViewOf,
  purgeEmpty,
  replaceMarks,
  sweepExpired,
  updateEvent,
} from '../src/db/repo.js';
import { NAME_KEY_VERSION, rekeyParticipants } from '../src/db/rekey.js';
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

  it('upgrades a v1 database to all languages without losing events, people or marks', () => {
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

    expect(migrate(db)).toBe(2);
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
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('polish', 'h', 'Kolacja', 'party', 'pl', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('czech', 'h', 'Večeře', 'party', 'cs', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('norwegian', 'h', 'Middag', 'party', 'nb', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('chinese', 'h', '聚餐', 'party', 'zh-Hant', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('simplified', 'h', '聚餐', 'party', 'zh-Hans', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('turkish', 'h', 'Akşam yemeği', 'party', 'tr', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('indonesian', 'h', 'Makan malam', 'party', 'id', 1, 0, 0, '2027-04-01')`
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
    expect(migrate(db)).toBe(2);
  });

  it('upgrades a v2 database to new languages without changing existing rows', () => {
    const db = new Db(':memory:');
    migrate(db, MIGRATIONS.slice(0, 2));
    db.run(
      `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
       VALUES ('old', 'h', 'Existing event', 'owl', 'ja', 1, 0, 0, '2027-04-01')`
    );
    db.run(
      "INSERT INTO event_days (event_id, day, added_at) VALUES ('old', '2027-03-06', 0)"
    );
    db.run(
      "INSERT INTO participants (id, event_id, name, name_key, source, created_at) VALUES ('p', 'old', 'Max', 'max', 'self', 0)"
    );
    db.run("INSERT INTO marks VALUES ('p', 'old', '2027-03-06', 'yes')");

    expect(migrate(db)).toBe(1);
    expect(
      db.get<{ language: string }>(
        'SELECT language FROM events WHERE id = ?',
        'old'
      )?.language
    ).toBe('ja');
    expect(db.all('SELECT * FROM event_days')).toHaveLength(1);
    expect(db.all('SELECT * FROM participants')).toHaveLength(1);
    expect(db.all('SELECT * FROM marks')).toHaveLength(1);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(
      db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('new', 'h', '聚餐', 'party', 'zh-Hant', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('polish', 'h', 'Kolacja', 'party', 'pl', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('czech', 'h', 'Večeře', 'party', 'cs', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('norwegian', 'h', 'Middag', 'party', 'nb', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('swedish', 'h', 'Middag', 'party', 'sv', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('finnish', 'h', 'Illallinen', 'party', 'fi', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('russian', 'h', 'Ужин', 'party', 'ru', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
    expect(
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES ('arabic', 'h', 'عشاء', 'party', 'ar', 1, 0, 0, '2027-04-01')`
      )
    ).toBe(1);
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

  it('keeps the CHECK limits of the schema equal to LIMITS', () => {
    // Migrations are applied history and never change: raising a limit needs
    // a rebuild migration like version 2, and this is what notices when it
    // is forgotten. A value of the limit is stored, one more is refused.
    const db = fresh();
    let n = 0;
    const event = (column: string, value: string | number): number => {
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days,
           created_at, last_write_at, expires_on)
         VALUES (?, 'h', 't', 'owl', 'en', 1, 0, 0, '2027-01-01')`,
        `e${++n}`
      );
      return db.run(
        `UPDATE events SET ${column} = ? WHERE id = ?`,
        value,
        `e${n}`
      );
    };
    const participant = (column: string, value: string): number => {
      db.run(
        `INSERT INTO participants (id, event_id, name, name_key, source, created_at)
         VALUES (?, (SELECT id FROM events LIMIT 1), 'n', ?, 'self', 0)`,
        `p${++n}`,
        `k${n}`
      );
      return db.run(
        `UPDATE participants SET ${column} = ? WHERE id = ?`,
        value,
        `p${n}`
      );
    };
    const bound = (
      write: (text: string) => number,
      limit: number,
      name: string
    ): void => {
      expect(write('x'.repeat(limit)), `${name} at the limit`).toBe(1);
      expect(() => write('x'.repeat(limit + 1)), `${name} over it`).toThrow();
    };
    bound((text) => event('title', text), LIMITS.title, 'title');
    expect(() => event('title', ''), 'empty title').toThrow();
    bound(
      (text) => event('description', text),
      LIMITS.description,
      'description'
    );
    bound((text) => event('location', text), LIMITS.location, 'location');
    bound((text) => event('creator_name', text), LIMITS.creatorName, 'creator');
    expect(event('duration_days', LIMITS.durationDays)).toBe(1);
    expect(() => event('duration_days', LIMITS.durationDays + 1)).toThrow();
    expect(() => event('duration_days', 0)).toThrow();
    for (const code of LANGUAGES) expect(event('language', code), code).toBe(1);
    expect(() => event('language', 'xx')).toThrow();
    bound((text) => participant('name', text), LIMITS.name, 'name');
    expect(() => participant('name', ''), 'empty name').toThrow();
    bound((text) => participant('note', text), LIMITS.note, 'note');
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

describe('migrate, when another process was quicker', () => {
  it('skips a migration that was applied since the versions were read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owl-migrate-'));
    try {
      const first = new Db(join(dir, 'owl.db'));
      migrate(first, [MIGRATIONS[0]!]);
      const second = new Db(join(dir, 'owl.db'));
      expect(migrate(second)).toBe(MIGRATIONS.length - 1);
      // `first` still believes only the first migration is applied.
      const stale = new Proxy(first, {
        get(target, key) {
          if (key === 'all') {
            return (sql: string, ...params: never[]) =>
              sql.startsWith('SELECT version, checksum')
                ? target
                    .all<{ version: number; checksum: string }>(sql, ...params)
                    .slice(0, 1)
                : target.all(sql, ...params);
          }
          const value = Reflect.get(target, key) as unknown;
          return typeof value === 'function'
            ? (value as (...args: unknown[]) => unknown).bind(target)
            : value;
        },
      });
      expect(migrate(stale)).toBe(0);
      expect(
        first.all('SELECT version FROM schema_migrations').map((r) => r)
      ).toHaveLength(MIGRATIONS.length);
      first.close();
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('counts only what it applied', () => {
    const db = new Db(':memory:');
    expect(migrate(db, [MIGRATIONS[0]!])).toBe(1);
    expect(migrate(db)).toBe(MIGRATIONS.length - 1);
    expect(migrate(db)).toBe(0);
  });
});

describe('pendingMigrations', () => {
  it('counts what is missing and changes nothing', () => {
    const db = new Db(':memory:');
    expect(pendingMigrations(db)).toBe(MIGRATIONS.length);
    expect(
      db.all("SELECT name FROM sqlite_master WHERE type = 'table'")
    ).toEqual([]);
    migrate(db, [MIGRATIONS[0]!]);
    expect(pendingMigrations(db)).toBe(MIGRATIONS.length - 1);
    migrate(db);
    expect(pendingMigrations(db)).toBe(0);
  });

  it('refuses a database that does not match this release', () => {
    const db = new Db(':memory:');
    migrate(db);
    db.run(
      'INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (99, ?, 0)',
      'x'
    );
    expect(() => pendingMigrations(db)).toThrow(MigrationError);
  });
});

describe('Db.tx', () => {
  it('throws the first error when SQLite already rolled back', () => {
    const db = new Db(':memory:');
    db.exec('CREATE TABLE t (v INTEGER) STRICT');
    expect(() =>
      db.tx(() => {
        db.run('INSERT INTO t VALUES (1)');
        // What SQLite does by itself on a full disk or an I/O error.
        db.exec('ROLLBACK');
        throw new Error('disk full');
      })
    ).toThrow('disk full');
    expect(db.all('SELECT v FROM t')).toEqual([]);
    // And the connection is usable again.
    db.tx(() => db.run('INSERT INTO t VALUES (2)'));
    expect(db.all('SELECT v FROM t')).toEqual([{ v: 2 }]);
  });

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

describe('replaceMarks and the days a save knew', () => {
  const DAYS: [string, number][] = [
    ['2027-03-05', 100],
    ['2027-03-06', 100],
    ['2027-03-07', 5000],
    ['2027-03-08', 7000],
  ];
  const ALL = DAYS.map(([day]) => day);

  /** One event with DAYS, one person created at 100 who last answered at `markedAt`. */
  const setup = (markedAt: number | null) => {
    const db = fresh();
    db.run(
      `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
       VALUES ('e', 'h', 't', 'owl', 'en', 1, 100, 100, '2028-01-01')`
    );
    for (const [day, addedAt] of DAYS)
      db.run(
        'INSERT INTO event_days (event_id, day, added_at) VALUES (?, ?, ?)',
        'e',
        day,
        addedAt
      );
    db.run(
      `INSERT INTO participants (id, event_id, name, name_key, source, marks_at, created_at)
       VALUES ('p', 'e', 'Max', 'max', 'self', ?, 100)`,
      markedAt
    );
    const save = (
      known: string[] | undefined,
      now: number,
      baseRev = 0,
      yes: string[] = []
    ) => replaceMarks(db, 'e', 'p', baseRev, yes, [], now, known);
    const state = () => {
      const row = db.get<{ marks_at: number | null; rev: number }>(
        'SELECT marks_at, rev FROM participants WHERE id = ?',
        'p'
      )!;
      return { markedAt: row.marks_at, rev: row.rev };
    };
    const unseen = () =>
      participantViewOf(db, 'e', getParticipant(db, 'e', 'p')!).unseen;
    return { db, save, state, unseen };
  };

  it('stamps the time of the save when no list comes with it', () => {
    const { save, state, unseen } = setup(1000);
    expect(save(undefined, 9000).ok).toBe(true);
    expect(state()).toEqual({ markedAt: 9000, rev: 1 });
    expect(unseen()).toEqual([]);
  });

  it('stamps the time of the save when the list has every day added since', () => {
    const { save, state, unseen } = setup(1000);
    expect(save(ALL, 9000).ok).toBe(true);
    expect(state().markedAt).toBe(9000);
    expect(unseen()).toEqual([]);
  });

  it('stamps one millisecond before the first day added since that the list lacks', () => {
    const { save, state, unseen } = setup(1000);
    // Knows the day added at 5000, not the one added at 7000.
    expect(save(ALL.slice(0, 3), 9000).ok).toBe(true);
    expect(state().markedAt).toBe(6999);
    expect(unseen()).toEqual(['2027-03-08']);
  });

  it('lets the first lacking day decide, whichever the list holds after it', () => {
    const { save, state, unseen } = setup(1000);
    expect(save(['2027-03-05', '2027-03-08'], 9000).ok).toBe(true);
    expect(state().markedAt).toBe(4999);
    expect(unseen()).toEqual(['2027-03-07', '2027-03-08']);
  });

  it('counts a day added in the very millisecond of the last answer as seen', () => {
    const { save, state } = setup(5000);
    expect(save(['2027-03-05', '2027-03-06'], 9000).ok).toBe(true);
    // Only the day added at 7000 is newer than 5000; 5000 itself is not.
    expect(state().markedAt).toBe(6999);
  });

  it('never goes back past the last answer', () => {
    const { save, state, unseen } = setup(4999);
    // The day added at 5000 is the first new one: 4999 is as far as it goes.
    expect(save([], 9000).ok).toBe(true);
    expect(state().markedAt).toBe(4999);
    expect(unseen()).toEqual(['2027-03-07', '2027-03-08']);
    expect(save([], 9500, 1).ok).toBe(true);
    expect(state().markedAt).toBe(4999);
  });

  it('never stamps a time later than the save itself', () => {
    // A clock that stepped back: the lacking day looks younger than "now".
    const { save, state } = setup(1000);
    expect(save(ALL.slice(0, 3), 3000).ok).toBe(true);
    expect(state().markedAt).toBe(3000);
  });

  it('counts from the creation of someone who never answered', () => {
    const { save, state, unseen } = setup(null);
    expect(save(['2027-03-05', '2027-03-06'], 9000).ok).toBe(true);
    // Created at 100: the days added at 5000 and 7000 are both new to them.
    expect(state().markedAt).toBe(4999);
    expect(unseen()).toEqual(['2027-03-07', '2027-03-08']);
    const second = setup(null);
    expect(second.save(ALL, 9000).ok).toBe(true);
    expect(second.state().markedAt).toBe(9000);
    // The days added at creation are no news, whatever the list says.
    const third = setup(null);
    expect(third.save([], 9000).ok).toBe(true);
    expect(third.state().markedAt).toBe(4999);
  });

  it('answers a save on an old revision without touching the answer time', () => {
    const { save, state } = setup(1000);
    expect(save(ALL, 2000).ok).toBe(true);
    const refused = save([], 9000, 0);
    expect(refused).toMatchObject({ ok: false, rev: 1 });
    expect(state()).toEqual({ markedAt: 2000, rev: 1 });
  });

  it('keeps its marks, and ignores listed days that are no candidates', () => {
    const { db, save, state } = setup(1000);
    expect(
      save(['2027-03-05', '2099-01-01', 'not a day'], 9000, 0, ['2027-03-05'])
        .ok
    ).toBe(true);
    expect(state().markedAt).toBe(4999);
    expect(
      db.all('SELECT day, state FROM marks WHERE participant_id = ?', 'p')
    ).toEqual([{ day: '2027-03-05', state: 'yes' }]);
  });
});

describe('listing and purging new events', () => {
  const event = (db: Db, id: string, createdAt: number) =>
    db.run(
      `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
       VALUES (?, 'h', ?, 'owl', 'en', 1, ?, ?, '2027-06-01')`,
      id,
      `Event ${id}`,
      createdAt,
      createdAt
    );
  const day = (iso: string) => utcDateOf(iso).getTime();

  const person = (
    db: Db,
    id: string,
    eventId: string,
    source: 'roster' | 'self',
    marksAt: number | null
  ) =>
    db.run(
      `INSERT INTO participants (id, event_id, name, name_key, source, marks_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      id,
      eventId,
      id,
      id,
      source,
      marksAt
    );

  it('lists from the given day on, newest first, with how many answered', () => {
    const db = fresh();
    event(db, 'old', day('2027-02-28'));
    event(db, 'start', day('2027-03-01'));
    event(db, 'late', day('2027-03-02') + 5000);
    person(db, 'p', 'start', 'self', 1);
    const listed = listEvents(db, '2027-03-01');
    expect(listed.map((e) => e.id)).toEqual(['late', 'start']);
    expect(listed.map((e) => e.participants)).toEqual([0, 1]);
    expect(listed[1]!.created).toBe('2027-03-01T00:00:00Z');
    expect(listEvents(db, null)).toHaveLength(3);
    expect(listEvents(db, '2027-03-03')).toEqual([]);
  });

  it('counts only people with marks, not names nobody has answered under', () => {
    const db = fresh();
    event(db, 'none', day('2027-03-01'));
    event(db, 'roster', day('2027-03-01'));
    event(db, 'rostered', day('2027-03-01'));
    event(db, 'self', day('2027-03-01'));
    event(db, 'joined', day('2027-03-01'));
    person(db, 'a', 'roster', 'roster', null);
    person(db, 'b', 'roster', 'roster', null);
    person(db, 'c', 'rostered', 'roster', 1);
    person(db, 'd', 'rostered', 'roster', null);
    person(db, 'e', 'self', 'self', null);
    person(db, 'f', 'joined', 'self', 1);
    const counts = Object.fromEntries(
      listEvents(db, null).map((e) => [e.id, e.participants])
    );
    expect(counts).toEqual({
      none: 0,
      roster: 0,
      rostered: 1,
      self: 0,
      joined: 1,
    });
  });

  it('purges only the ones nobody answered since the day', () => {
    const db = fresh();
    event(db, 'old', day('2027-02-28'));
    event(db, 'empty', day('2027-03-01'));
    event(db, 'roster', day('2027-03-01') + 1000);
    event(db, 'rostered', day('2027-03-01'));
    event(db, 'joined', day('2027-03-01'));
    person(db, 'a', 'roster', 'roster', null);
    person(db, 'b', 'rostered', 'roster', 1);
    person(db, 'c', 'joined', 'self', 1);
    person(db, 'd', 'old', 'roster', null);
    // What the dry run counts is what the purge deletes.
    expect(emptyEventIds(db, '2027-03-01').sort()).toEqual(['empty', 'roster']);
    expect(purgeEmpty(db, '2027-03-01').sort()).toEqual(['empty', 'roster']);
    expect(
      db
        .all<{ id: string }>('SELECT id FROM events ORDER BY id')
        .map((r) => r.id)
    ).toEqual(['joined', 'old', 'rostered']);
    expect(purgeEmpty(db, '2027-03-01')).toEqual([]);
  });

  it('purges nothing from an empty database or from after the last event', () => {
    const db = fresh();
    expect(purgeEmpty(db, '2027-03-01')).toEqual([]);
    expect(emptyEventIds(db, '2027-03-01')).toEqual([]);
    expect(listEvents(db, null)).toEqual([]);
    event(db, 'empty', day('2027-03-01'));
    expect(emptyEventIds(db, '2027-03-02')).toEqual([]);
    expect(emptyEventIds(db, '2027-03-01')).toEqual(['empty']);
    expect(purgeEmpty(db, '2027-03-02')).toEqual([]);
    expect(purgeEmpty(db, '2027-03-01')).toEqual(['empty']);
  });
});

describe('deleting many events', () => {
  const insert = (db: Db, ids: string[], expiresOn = '2027-03-01'): void => {
    db.tx(() => {
      for (const id of ids) {
        db.run(
          `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
           VALUES (?, 'h', 't', 'owl', 'en', 1, 1000, 1000, ?)`,
          id,
          expiresOn
        );
      }
    });
  };
  const ids = (n: number, prefix = 'e'): string[] =>
    Array.from(
      { length: n },
      (_, i) => `${prefix}${String(i).padStart(5, '0')}`
    );
  const count = (db: Db): number =>
    db.get<{ n: number }>('SELECT count(*) AS n FROM events')!.n;

  it.each([0, 1, 199, 200, 201, 400, 401, 1000])(
    'sweeps %i expired events, and only those',
    (n) => {
      const db = fresh();
      insert(db, ids(n));
      insert(db, ['kept'], '2027-03-02');
      const swept = sweepExpired(db, '2027-03-02');
      expect(swept.sort()).toEqual(ids(n));
      expect(count(db)).toBe(1);
      expect(sweepExpired(db, '2027-03-02')).toEqual([]);
    }
  );

  it('sweeps nothing on the last day itself', () => {
    const db = fresh();
    insert(db, ids(3));
    expect(sweepExpired(db, '2027-03-01')).toEqual([]);
    expect(count(db)).toBe(3);
  });

  it('takes their days, people and marks along', () => {
    const db = fresh();
    insert(db, ids(250));
    db.run(
      "INSERT INTO event_days (event_id, day, added_at) VALUES ('e00249', '2027-02-27', 0)"
    );
    db.run(
      `INSERT INTO participants (id, event_id, name, name_key, source, created_at)
       VALUES ('p', 'e00249', 'Anna', 'anna', 'self', 0)`
    );
    sweepExpired(db, '2027-03-02');
    for (const table of ['event_days', 'participants', 'marks']) {
      expect(db.get(`SELECT 1 FROM ${table}`)).toBeUndefined();
    }
  });

  it.each([0, 1, 199, 200, 201, 650])(
    'purges %i events nobody answered',
    (n) => {
      const db = fresh();
      insert(db, ids(n));
      insert(db, ['answered']);
      db.run(
        `INSERT INTO participants (id, event_id, name, name_key, source, marks_at, created_at)
       VALUES ('p', 'answered', 'Anna', 'anna', 'self', 1, 0)`
      );
      const purged = purgeEmpty(db, '1970-01-01');
      expect(purged.sort()).toEqual(ids(n));
      expect(count(db)).toBe(1);
    }
  );

  it('leaves an event that was answered after the list was made', () => {
    const db = fresh();
    insert(db, ids(3));
    // The answer arrives between listing and deleting.
    const racing = new Proxy(db, {
      get(target, key) {
        const value = Reflect.get(target, key) as unknown;
        if (key === 'tx') {
          return (fn: () => unknown) => {
            target.run(
              `INSERT OR IGNORE INTO participants (id, event_id, name, name_key, source, marks_at, created_at)
               VALUES ('late', 'e00001', 'Anna', 'anna', 'self', 1, 0)`
            );
            return target.tx(fn);
          };
        }
        return typeof value === 'function'
          ? (value as (...args: unknown[]) => unknown).bind(target)
          : value;
      },
    });
    expect(purgeEmpty(racing, '1970-01-01').sort()).toEqual([
      'e00000',
      'e00002',
    ]);
    expect(count(db)).toBe(1);
  });
});

describe('the block check behind a chosen date', () => {
  const NOW = Date.UTC(2027, 2, 1);

  /** Replaces the one event 'ev' with the given duration, days and chosen date. */
  const seed = (
    db: Db,
    duration: number,
    days: readonly string[],
    chosen?: { start: string; end: string }
  ) => {
    db.run('DELETE FROM event_days');
    db.run('DELETE FROM events');
    db.run(
      `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on, closed_at, final_start, final_end)
       VALUES ('ev', 'h', 't', 'owl', 'en', ?, 0, 0, '9999-12-31', ?, ?, ?)`,
      duration,
      chosen ? 0 : null,
      chosen?.start ?? null,
      chosen?.end ?? null
    );
    for (const day of days) {
      db.run(
        "INSERT INTO event_days (event_id, day, added_at) VALUES ('ev', ?, 0)",
        day
      );
    }
  };

  const daysOf = (db: Db) => getDays(db, 'ev').map((row) => row.day);
  const finalOf = (db: Db) => {
    const event = getEvent(db, 'ev')!;
    return { start: event.final_start, end: event.final_end };
  };

  // The query the check used to be, kept as the reference for the shared one.
  const byQuery = (db: Db, duration: number, start: string): boolean => {
    if (diffDays(start, LAST_DAY) < duration - 1) return false;
    const end = addDays(start, duration - 1);
    const count = db.get<{ n: number }>(
      'SELECT count(*) AS n FROM event_days WHERE event_id = ? AND day BETWEEN ? AND ?',
      'ev',
      start,
      end
    )!.n;
    return count === diffDays(start, end) + 1;
  };

  it('gives the answer of the query it replaced, in the cases that matter', () => {
    const db = fresh();
    const cases: [number, string[], string, boolean][] = [
      [2, ['2027-03-05', '2027-03-06', '2027-03-08'], '2027-03-05', true],
      [2, ['2027-03-05', '2027-03-06', '2027-03-08'], '2027-03-06', false],
      [2, ['2027-03-05', '2027-03-06', '2027-03-08'], '2027-03-07', false],
      [1, ['2027-03-05'], '2027-03-05', true],
      [1, ['2027-03-05'], '2027-03-06', false],
      [3, ['2027-03-05', '2027-03-06'], '2027-03-05', false],
      [2, ['2027-02-28', '2027-03-01'], '2027-02-28', true],
      [2, ['9999-12-30', '9999-12-31'], '9999-12-31', false],
      [2, ['9999-12-30', '9999-12-31'], '9999-12-30', true],
      [1, ['9999-12-31'], '9999-12-31', true],
      [14, ['9999-12-30', '9999-12-31'], '9999-12-30', false],
    ];
    for (const [duration, days, start, expected] of cases) {
      seed(db, duration, days);
      const label = `${duration} from ${start} in ${days.join(' ')}`;
      expect(byQuery(db, duration, start), label).toBe(expected);
      expect(blockFits(daysOf(db), start, duration), label).toBe(expected);
    }
  });

  it('agrees with that query for any days, start and duration', () => {
    const db = fresh();
    seed(db, 1, []);
    // Windows across a month, a year and the end of the calendar.
    const bases = ['2027-02-20', '2026-12-25', '9999-12-15'];
    fc.assert(
      fc.property(
        fc.constantFrom(...bases),
        fc.uniqueArray(fc.integer({ min: 0, max: 16 }), { maxLength: 17 }),
        fc.integer({ min: 0, max: 16 }),
        fc.integer({ min: 1, max: 14 }),
        (base, offsets, start, duration) => {
          seed(
            db,
            duration,
            offsets.map((n) => addDays(base, n))
          );
          expect(blockFits(daysOf(db), addDays(base, start), duration)).toBe(
            byQuery(db, duration, addDays(base, start))
          );
        }
      ),
      { numRuns: 300 }
    );
  });

  describe('when the days or the duration of a poll with a chosen date change', () => {
    const MARCH = ['2027-03-05', '2027-03-06', '2027-03-07', '2027-03-08'];
    const chosen = { start: '2027-03-06', end: '2027-03-07' };
    const edit = (
      patch: { days?: string[]; durationDays?: number },
      before = { days: MARCH, duration: 2, chosen }
    ) => {
      const db = fresh();
      seed(db, before.duration, before.days, before.chosen);
      updateEvent(db, 'ev', patch, NOW);
      return finalOf(db);
    };

    it('keeps it when nothing it needs changes', () => {
      expect(edit({ days: ['2027-03-06', '2027-03-07'] })).toEqual(chosen);
      expect(edit({ durationDays: 2 })).toEqual(chosen);
    });

    it('lengthens it with the duration when the days are there', () => {
      expect(edit({ durationDays: 3 })).toEqual({
        start: '2027-03-06',
        end: '2027-03-08',
      });
    });

    it('shortens it with the duration', () => {
      expect(edit({ durationDays: 1 })).toEqual({
        start: '2027-03-06',
        end: '2027-03-06',
      });
    });

    it('drops it when a day of it goes, or the new duration has no room', () => {
      const dropped = { start: null, end: null };
      expect(
        edit({ days: ['2027-03-05', '2027-03-06', '2027-03-08'] })
      ).toEqual(dropped);
      expect(
        edit({ days: ['2027-03-05', '2027-03-07', '2027-03-08'] })
      ).toEqual(dropped);
      expect(edit({ durationDays: 4 })).toEqual(dropped);
    });

    it('does not throw at the end of the calendar', () => {
      const before = {
        days: ['9999-12-30', '9999-12-31'],
        duration: 2,
        chosen: { start: '9999-12-30', end: '9999-12-31' },
      };
      expect(edit({ durationDays: 3 }, before)).toEqual({
        start: null,
        end: null,
      });
      expect(edit({ durationDays: 1 }, before)).toEqual({
        start: '9999-12-30',
        end: '9999-12-30',
      });
      const last = {
        days: ['9999-12-31'],
        duration: 1,
        chosen: { start: '9999-12-31', end: '9999-12-31' },
      };
      expect(edit({}, last)).toEqual(last.chosen);
      expect(edit({ durationDays: 2 }, last)).toEqual({
        start: null,
        end: null,
      });
    });

    it('tells the organiser what the server then does, whatever the days', () => {
      const db = fresh();
      const bases = ['2027-02-20', '9999-12-15'];
      const days = (base: string) =>
        fc
          .oneof(
            fc.uniqueArray(fc.integer({ min: 0, max: 16 }), {
              minLength: 1,
              maxLength: 17,
            }),
            // Nearly all of them, so a chosen date survives often enough.
            fc
              .uniqueArray(fc.integer({ min: 0, max: 16 }), { maxLength: 3 })
              .map((holes) =>
                Array.from({ length: 17 }, (_, n) => n).filter(
                  (n) => !holes.includes(n)
                )
              )
          )
          .map((offsets) => offsets.map((n) => addDays(base, n)).toSorted());
      fc.assert(
        fc.property(
          fc.constantFrom(...bases).chain((base) =>
            fc.record({
              base: fc.constant(base),
              was: days(base),
              next: days(base),
            })
          ),
          fc.integer({ min: 1, max: 4 }),
          fc.integer({ min: 1, max: 6 }),
          ({ was, next }, wasDuration, nextDuration) => {
            const start = was.find((day) => blockFits(was, day, wasDuration));
            fc.pre(start !== undefined);
            const end = addDays(start!, wasDuration - 1);
            seed(db, wasDuration, was, { start: start!, end });
            updateEvent(
              db,
              'ev',
              { days: next, durationDays: nextDuration },
              NOW
            );
            const after = finalOf(db);
            const stored =
              after.end === null
                ? 'dropped'
                : after.end < end
                  ? 'shortened'
                  : 'kept';
            const told = savingImpact(
              {
                days: was,
                durationDays: wasDuration,
                finalStart: start!,
                finalEnd: end,
              },
              [],
              { days: next, durationDays: nextDuration }
            ).date;
            expect(told).toBe(stored);
            if (after.end !== null) {
              expect(after.end).toBe(addDays(start!, nextDuration - 1));
            }
          }
        ),
        { numRuns: 300 }
      );
    });
  });
});

describe('rekeyParticipants', () => {
  const OLD_KEY = 'anna\u2764\ufe0f';
  const person = (
    db: Db,
    id: string,
    eventId: string,
    name: string,
    key: string,
    createdAt = 0
  ) =>
    db.run(
      `INSERT INTO participants (id, event_id, name, name_key, source, created_at)
       VALUES (?, ?, ?, ?, 'self', ?)`,
      id,
      eventId,
      name,
      key,
      createdAt
    );
  const keyOf = (db: Db, id: string): string =>
    db.get<{ name_key: string }>(
      'SELECT name_key FROM participants WHERE id = ?',
      id
    )!.name_key;
  const seeded = (): Db => {
    const db = fresh();
    for (const id of ['one', 'two']) {
      db.run(
        `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
         VALUES (?, 'h', 't', 'owl', 'en', 1, 0, 0, '2027-04-01')`,
        id
      );
    }
    return db;
  };
  const version = (db: Db): number =>
    Number(
      db.get<{ user_version: number }>('PRAGMA user_version')!.user_version
    );

  it('recomputes a key made by an earlier rule, so the person is found again', () => {
    const db = seeded();
    const name = 'Anna\u2764\ufe0f';
    expect(nameKey(name)).not.toBe(OLD_KEY);
    person(db, 'a', 'one', name, OLD_KEY);
    expect(findParticipantByKey(db, 'one', nameKey(name))).toBeUndefined();
    expect(rekeyParticipants(db)).toEqual({ updated: 1, skipped: 0 });
    expect(findParticipantByKey(db, 'one', nameKey(name))?.id).toBe('a');
    expect(version(db)).toBe(NAME_KEY_VERSION);
  });

  it('leaves a key that is current, and the name as typed', () => {
    const db = seeded();
    person(db, 'a', 'one', 'Max', 'max');
    person(db, 'b', 'one', 'Anna\u2764\ufe0f', OLD_KEY);
    expect(rekeyParticipants(db)).toEqual({ updated: 1, skipped: 0 });
    expect(keyOf(db, 'a')).toBe('max');
    expect(
      db.get<{ name: string }>("SELECT name FROM participants WHERE id = 'b'")!
        .name
    ).toBe('Anna\u2764\ufe0f');
  });

  it('skips an entry whose new key is held by another of the same event', () => {
    const db = seeded();
    person(db, 'old', 'one', 'Anna\u2764', nameKey('Anna\u2764'), 1);
    person(db, 'new', 'one', 'Anna\u2764\ufe0f', OLD_KEY, 2);
    // The same two names in another event do not collide.
    person(db, 'other', 'two', 'Anna\u2764\ufe0f', OLD_KEY, 3);
    expect(rekeyParticipants(db)).toEqual({ updated: 1, skipped: 1 });
    expect(keyOf(db, 'old')).toBe(nameKey('Anna\u2764'));
    expect(keyOf(db, 'new')).toBe(OLD_KEY);
    expect(keyOf(db, 'other')).toBe(nameKey('Anna\u2764\ufe0f'));
  });

  it('skips two old entries that would share one key, keeping the older one', () => {
    const db = seeded();
    person(db, 'first', 'one', 'Ma\u00adx', 'ma\u00adx', 1);
    person(db, 'second', 'one', 'Max\u00ad', 'max\u00ad', 2);
    expect(rekeyParticipants(db)).toEqual({ updated: 1, skipped: 1 });
    expect(keyOf(db, 'first')).toBe('max');
    expect(keyOf(db, 'second')).toBe('max\u00ad');
  });

  it('keeps the key of a name that has none any more', () => {
    const db = seeded();
    person(db, 'a', 'one', '\u00ad\u00ad', 'old');
    expect(rekeyParticipants(db)).toEqual({ updated: 0, skipped: 1 });
    expect(keyOf(db, 'a')).toBe('old');
  });

  it('runs once per version', () => {
    const db = seeded();
    person(db, 'a', 'one', 'Anna\u2764\ufe0f', OLD_KEY);
    expect(rekeyParticipants(db).updated).toBe(1);
    // A key written the old way after the step is not touched by a second start.
    db.run("UPDATE participants SET name_key = ? WHERE id = 'a'", OLD_KEY);
    expect(rekeyParticipants(db)).toEqual({ updated: 0, skipped: 0 });
    expect(keyOf(db, 'a')).toBe(OLD_KEY);
    // A new version runs it again.
    expect(rekeyParticipants(db, NAME_KEY_VERSION + 1).updated).toBe(1);
    expect(version(db)).toBe(NAME_KEY_VERSION + 1);
  });

  it('leaves a database that a newer release keyed', () => {
    const db = seeded();
    db.exec(`PRAGMA user_version = ${NAME_KEY_VERSION + 4}`);
    person(db, 'a', 'one', 'Anna\u2764\ufe0f', OLD_KEY);
    expect(rekeyParticipants(db)).toEqual({ updated: 0, skipped: 0 });
    expect(keyOf(db, 'a')).toBe(OLD_KEY);
    expect(version(db)).toBe(NAME_KEY_VERSION + 4);
  });

  it('rekeys a database keyed by version 1, and skips a colliding pair instead of failing', () => {
    expect(NAME_KEY_VERSION).toBeGreaterThanOrEqual(2);
    const db = seeded();
    db.exec('PRAGMA user_version = 1');
    // Version 1 left the accent apart from its letter behind a joiner.
    const V1_KEY = 'jose\u0301';
    person(db, 'split', 'one', 'Jose\u200d\u0301', V1_KEY, 1);
    person(db, 'plain', 'two', 'Jos\u00e9', 'jos\u00e9', 2);
    person(db, 'split-two', 'two', 'Jose\u200d\u0301', V1_KEY, 3);
    // A pair in one event: the older keeps the key, the younger is left alone.
    person(db, 'old', 'one', 'Zo\u00eb', 'zo\u00eb', 4);
    person(db, 'young', 'one', 'Zoe\u200c\u0308', 'zoe\u0308', 5);
    expect(rekeyParticipants(db)).toEqual({ updated: 1, skipped: 2 });
    expect(keyOf(db, 'split')).toBe('jos\u00e9');
    expect(keyOf(db, 'split-two')).toBe(V1_KEY);
    expect(keyOf(db, 'young')).toBe('zoe\u0308');
    expect(version(db)).toBe(NAME_KEY_VERSION);
    // The person typing the name the new way finds the rekeyed entry.
    expect(
      findParticipantByKey(db, 'one', nameKey('Jose\u200d\u0301'))?.id
    ).toBe('split');
    // A second start has nothing left to do.
    expect(rekeyParticipants(db)).toEqual({ updated: 0, skipped: 0 });
  });

  it('leaves a database that is already at version 2 as it is', () => {
    const db = seeded();
    db.exec('PRAGMA user_version = 2');
    person(db, 'a', 'one', 'Jose\u200d\u0301', 'jose\u0301');
    expect(rekeyParticipants(db, 2)).toEqual({ updated: 0, skipped: 0 });
    expect(keyOf(db, 'a')).toBe('jose\u0301');
  });

  it('records the version on an empty database, and rejects a bad one', () => {
    const db = seeded();
    expect(version(db)).toBe(0);
    expect(rekeyParticipants(db)).toEqual({ updated: 0, skipped: 0 });
    expect(version(db)).toBe(NAME_KEY_VERSION);
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => rekeyParticipants(db, bad)).toThrow(RangeError);
    }
  });

  it('leaves the migrations alone', () => {
    const db = seeded();
    rekeyParticipants(db);
    expect(pendingMigrations(db)).toBe(0);
  });

  // `NAME_KEY_VERSION` has to be raised whenever one of these changes.
  it('is still keyed by the rules the version stands for', () => {
    const keys: [string, string][] = [
      ['Anna\u2764\ufe0f', 'anna\u2764'],
      ['Max\u00ad', 'max'],
      ['\uff2d\uff41\uff58', 'max'],
      ['\u00c4NNA', '\u00e4nna'],
      ['a\u034fb', 'ab'],
      ['\u3164', ''],
      ['\u2800x', 'x'],
      ['\u000bz\u000c', 'z'],
      ['Stra\u00dfe', 'stra\u00dfe'],
      ['Jose\u200d\u0301', 'jos\u00e9'],
      ['a \u00a8b', 'a \u0308b'],
    ];
    for (const [name, key] of keys) {
      expect(nameKey(name), `raise NAME_KEY_VERSION: ${name}`).toBe(key);
    }
  });
});
