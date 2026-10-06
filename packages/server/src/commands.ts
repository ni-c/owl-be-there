import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isId, isValidISODate, todayUTC } from '@owl/shared';
import { ConfigError, loadConfig } from './config.js';
import { MigrationError, pendingMigrations } from './db/migrations.js';
import {
  deleteEvent,
  emptyEventIds,
  listEvents,
  purgeEmpty,
  stats,
  sweepExpired,
  weeklyStats,
} from './db/repo.js';
import { Db } from './db/sqlite.js';

/**
 * The operator's command line, for the few things that should not need a
 * browser:
 *
 *     node packages/server/dist/cli.js stats
 *     node packages/server/dist/cli.js weeks
 *     node packages/server/dist/cli.js delete <event id>
 *     node packages/server/dist/cli.js sweep
 *     node packages/server/dist/cli.js list [<YYYY-MM-DD>]
 *     node packages/server/dist/cli.js purge <YYYY-MM-DD> [--yes]
 *
 * `weeks` counts per ISO week the events created, how many of them somebody
 * answered, and the people who joined — numbers only, as far back as
 * retention keeps events.
 *
 * `delete` is for abuse reports: it removes one event and everything in it,
 * the same way the organiser's own delete button does. It works against a
 * running server — SQLite takes care of the locking — but a live stream to
 * that event only learns about it when it reconnects.
 *
 * `list` and `purge` are for a flood of new events: `list` shows the events
 * created since a day with how many people answered, and `purge` deletes those
 * among them that nobody answered. Without `--yes` it only says what it would
 * delete.
 *
 * It only works on a database that exists and is up to date: it neither creates
 * one nor upgrades one, so a mistyped command or a wrong directory leaves
 * nothing behind, and a newer image run against the volume of a server that is
 * still running does not change its schema under it. Start the server to
 * upgrade.
 */
export const USAGE =
  'Usage: cli.js stats | weeks | delete <event id> | sweep | list [<YYYY-MM-DD>] | purge <YYYY-MM-DD> [--yes]';

const COMMANDS = ['stats', 'weeks', 'delete', 'sweep', 'list', 'purge'];

/** Where the output goes; the command line's own is the console. */
export interface Output {
  out(line: string): void;
  err(line: string): void;
}

const consoleOutput: Output = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

/** Run one command; returns the exit code. */
export function run(
  args: string[],
  env: Record<string, string | undefined> = process.env,
  io: Output = consoleOutput
): number {
  const [command, argument] = args;
  // What can be checked without the database is checked before it is opened.
  if (command === undefined || !COMMANDS.includes(command)) {
    io.err(USAGE);
    return 2;
  }
  if (command === 'delete' && (!argument || !isId(argument))) {
    io.err(
      'Give the id of the event: the 12 characters after /e/ in its link.'
    );
    return 2;
  }
  if ((command === 'list' && argument !== undefined) || command === 'purge') {
    if (argument === undefined || !isValidISODate(argument)) {
      io.err('Give the first day as YYYY-MM-DD.');
      return 2;
    }
  }

  let config;
  try {
    config = loadConfig(env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    io.err(error.message);
    return 2;
  }
  const path = join(config.dataDir, 'owl.db');
  if (!existsSync(path)) {
    io.err(`There is no database at ${path}; is DATA_DIR the server's?`);
    return 1;
  }

  const db = new Db(path);
  try {
    try {
      if (pendingMigrations(db) > 0) {
        io.err(
          'The database is older than this release; start the server once to upgrade it.'
        );
        return 1;
      }
    } catch (error) {
      if (!(error instanceof MigrationError)) throw error;
      io.err(error.message);
      return 1;
    }
    switch (command) {
      case 'stats': {
        io.out(JSON.stringify(stats(db)));
        return 0;
      }
      case 'weeks': {
        io.out('week      events  answered  people');
        for (const week of weeklyStats(db)) {
          io.out(
            [
              week.week.padEnd(8),
              String(week.events).padStart(6),
              String(week.answered).padStart(8),
              String(week.participants).padStart(6),
            ].join('  ')
          );
        }
        return 0;
      }
      case 'delete': {
        const deleted = deleteEvent(db, argument!);
        db.checkpoint();
        io.out(deleted ? `Deleted ${argument}.` : `No event ${argument}.`);
        return deleted ? 0 : 1;
      }
      case 'sweep': {
        const ids = sweepExpired(db, todayUTC());
        db.checkpoint();
        io.out(`Deleted ${ids.length} expired event(s).`);
        return 0;
      }
      case 'list': {
        for (const event of listEvents(db, argument ?? null)) {
          io.out(
            `${event.id}  ${event.created}  ${String(event.participants).padStart(3)}  ${event.title}`
          );
        }
        return 0;
      }
      default: {
        // purge
        if (args[2] !== '--yes') {
          const ids = emptyEventIds(db, argument!);
          io.out(
            `Would delete ${ids.length} event(s) nobody answered; add --yes to do it.`
          );
          return 0;
        }
        const ids = purgeEmpty(db, argument!);
        db.checkpoint();
        io.out(`Deleted ${ids.length} event(s) nobody answered.`);
        return 0;
      }
    }
  } finally {
    db.close();
  }
}
