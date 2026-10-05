import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nameKey, utcDateOf } from '@owl/shared';
import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  migrate,
  MigrationError,
  pendingMigrations,
} from '../src/db/migrations.js';
import {
  blockFits,
  findParticipantByKey,
  listEvents,
  purgeEmpty,
  sweepExpired,
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
    expect(listEvents(db, null)).toEqual([]);
    event(db, 'empty', day('2027-03-01'));
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

describe('blockFits', () => {
  const eventWith = (db: Db, duration: number, days: string[]) => {
    db.run(
      `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
       VALUES ('ev', 'h', 't', 'owl', 'en', ?, 0, 0, '9999-12-31')`,
      duration
    );
    for (const day of days) {
      db.run(
        "INSERT INTO event_days (event_id, day, added_at) VALUES ('ev', ?, 0)",
        day
      );
    }
    return { id: 'ev', duration_days: duration };
  };

  it('is true for a run of candidate days and false for a gap', () => {
    const db = fresh();
    const event = eventWith(db, 2, ['2027-03-05', '2027-03-06', '2027-03-08']);
    expect(blockFits(db, event, '2027-03-05')).toBe(true);
    expect(blockFits(db, event, '2027-03-06')).toBe(false);
    expect(blockFits(db, event, '2027-03-07')).toBe(false);
  });

  it('answers false rather than throwing at the end of the calendar', () => {
    const db = fresh();
    const event = eventWith(db, 2, ['9999-12-30', '9999-12-31']);
    expect(blockFits(db, event, '9999-12-31')).toBe(false);
    expect(blockFits(db, event, '9999-12-30')).toBe(true);
    const single = { id: 'ev', duration_days: 1 };
    expect(blockFits(db, single, '9999-12-31')).toBe(true);
    const long = { id: 'ev', duration_days: 14 };
    expect(blockFits(db, long, '9999-12-30')).toBe(false);
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
    ];
    for (const [name, key] of keys) {
      expect(nameKey(name), `raise NAME_KEY_VERSION: ${name}`).toBe(key);
    }
  });
});
