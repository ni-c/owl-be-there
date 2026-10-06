import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run, USAGE } from '../src/commands.js';
import { MIGRATIONS, migrate } from '../src/db/migrations.js';
import { Db } from '../src/db/sqlite.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'owl-cli-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const cli = (
  args: string[],
  env: Record<string, string> = {}
): { code: number; out: string[]; err: string[] } => {
  const out: string[] = [];
  const err: string[] = [];
  const code = run(
    args,
    { DATA_DIR: dir, ...env },
    {
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    }
  );
  return { code, out, err };
};

const database = (upgrade = true): Db => {
  const db = new Db(join(dir, 'owl.db'));
  if (upgrade) migrate(db);
  return db;
};

const event = (db: Db, id: string): void => {
  db.run(
    `INSERT INTO events (id, admin_hash, title, emoji, language, duration_days, created_at, last_write_at, expires_on)
     VALUES (?, 'h', 'Title', 'owl', 'en', 1, 1800000000000, 1800000000000, '2027-04-01')`,
    id
  );
};

describe('a command that cannot work', () => {
  it.each([[[]], [['hepl']], [['stats2']], [['']]])(
    'prints the usage and creates nothing: %j',
    (args) => {
      const { code, err } = cli(args);
      expect(code).toBe(2);
      expect(err).toEqual([USAGE]);
      expect(readdirSync(dir)).toEqual([]);
    }
  );

  it('asks for an id, and for a day, before it opens anything', () => {
    for (const args of [
      ['delete'],
      ['delete', 'short'],
      ['list', '2027-13-01'],
      ['purge'],
      ['purge', 'yesterday'],
    ]) {
      const { code, err } = cli(args);
      expect(code, args.join(' ')).toBe(2);
      expect(err).toHaveLength(1);
    }
    expect(readdirSync(dir)).toEqual([]);
  });

  it('names the setting that is wrong, without a stack trace', () => {
    const { code, err } = cli(['stats'], { OWL_SECRET: 'short' });
    expect(code).toBe(2);
    expect(err.join('\n')).toMatch(/OWL_SECRET must be at least 32/);
    expect(err.join('\n')).not.toMatch(/\n\s+at /);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('does not create a database that is not there', () => {
    for (const args of [
      ['stats'],
      ['sweep'],
      ['list'],
      ['delete', 'AAAAAAAAAAAA'],
    ]) {
      const { code, err } = cli(args);
      expect(code, args.join(' ')).toBe(1);
      expect(err.join()).toMatch(/no database at .*owl\.db/);
    }
    expect(existsSync(join(dir, 'owl.db'))).toBe(false);
  });

  it('does not upgrade a database that is behind', () => {
    const db = database(false);
    migrate(db, [MIGRATIONS[0]!]);
    db.close();
    const { code, err } = cli(['stats']);
    expect(code).toBe(1);
    expect(err.join()).toMatch(/older than this release/);
    const check = database(false);
    expect(check.all('SELECT version FROM schema_migrations').length).toBe(1);
    check.close();
  });

  it('refuses a database that does not match this release', () => {
    const db = database();
    db.run(
      'INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (99, ?, 0)',
      'x'
    );
    db.close();
    const { code, err } = cli(['stats']);
    expect(code).toBe(1);
    expect(err.join()).toMatch(/does not know/);
  });
});

describe('a command that works', () => {
  it('shows the counts of an empty database', () => {
    database().close();
    expect(cli(['stats'])).toEqual({
      code: 0,
      out: ['{"events":0,"participants":0,"marks":0}'],
      err: [],
    });
  });

  it('counts by ISO week, across the turn of the year, and only who answered', () => {
    database().close();
    // An empty database: the header alone.
    expect(cli(['weeks'])).toEqual({
      code: 0,
      out: ['week      events  answered  people'],
      err: [],
    });

    const at = (year: number, month: number, day: number): number =>
      Date.UTC(year, month - 1, day, 12);
    const filled = database();
    const created = [
      ['AAAAAAAAAAAA', at(2026, 12, 31)], // Thursday: 2026-W53
      ['BBBBBBBBBBBB', at(2027, 1, 3)], // Sunday: still 2026-W53
      ['CCCCCCCCCCCC', at(2027, 1, 4)], // Monday: 2027-W01
    ] as const;
    for (const [id, time] of created) {
      event(filled, id);
      filled.run('UPDATE events SET created_at = ? WHERE id = ?', time, id);
    }
    const participant = (
      id: string,
      eventId: string,
      time: number,
      answered: boolean
    ): void => {
      filled.run(
        `INSERT INTO participants (id, event_id, name, name_key, source, marks_at, created_at)
         VALUES (?, ?, ?, ?, 'self', ?, ?)`,
        id,
        eventId,
        id,
        id,
        answered ? time : null,
        time
      );
    };
    participant('p1', 'AAAAAAAAAAAA', at(2027, 1, 1), true);
    participant('p2', 'AAAAAAAAAAAA', at(2027, 1, 5), true);
    // On the roster but never answered: no answer, no person.
    participant('p3', 'BBBBBBBBBBBB', at(2027, 1, 3), false);
    filled.close();

    expect(cli(['weeks']).out).toEqual([
      'week      events  answered  people',
      '2026-W53       2         1       1',
      '2027-W01       1         0       1',
    ]);
  });

  it('deletes one event, and says when there is none', () => {
    const db = database();
    event(db, 'AAAAAAAAAAAA');
    db.close();
    expect(cli(['delete', 'AAAAAAAAAAAA'])).toMatchObject({
      code: 0,
      out: ['Deleted AAAAAAAAAAAA.'],
    });
    expect(cli(['delete', 'AAAAAAAAAAAA'])).toMatchObject({
      code: 1,
      out: ['No event AAAAAAAAAAAA.'],
    });
  });

  it('lists, and purges only with --yes', () => {
    const db = database();
    event(db, 'AAAAAAAAAAAA');
    db.close();
    expect(cli(['list']).out).toHaveLength(1);
    expect(cli(['list', '2099-01-01']).out).toEqual([]);
    expect(cli(['purge', '2027-01-01']).out).toEqual([
      'Would delete 1 event(s) nobody answered; add --yes to do it.',
    ]);
    expect(cli(['list']).out).toHaveLength(1);
    expect(cli(['purge', '2027-01-01', '--yes']).out).toEqual([
      'Deleted 1 event(s) nobody answered.',
    ]);
    expect(cli(['list']).out).toEqual([]);
  });

  it('sweeps the events whose last day has passed', () => {
    const db = database();
    event(db, 'AAAAAAAAAAAA');
    db.run("UPDATE events SET expires_on = '2000-01-01'");
    db.close();
    expect(cli(['sweep']).out).toEqual(['Deleted 1 expired event(s).']);
    expect(cli(['sweep']).out).toEqual(['Deleted 0 expired event(s).']);
  });
});
