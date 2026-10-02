import { join } from 'node:path';
import { isId, todayUTC } from '@owl/shared';
import { loadConfig } from './config.js';
import { migrate } from './db/migrations.js';
import { deleteEvent, stats, sweepExpired } from './db/repo.js';
import { Db } from './db/sqlite.js';

/**
 * The operator's command line, for the few things that should not need a
 * browser:
 *
 *     node packages/server/dist/cli.js stats
 *     node packages/server/dist/cli.js delete <event id>
 *     node packages/server/dist/cli.js sweep
 *
 * `delete` is for abuse reports: it removes one event and everything in it,
 * the same way the organiser's own delete button does. It works against a
 * running server — SQLite takes care of the locking — but a live stream to
 * that event only learns about it when it reconnects.
 */
const USAGE = 'Usage: cli.js stats | delete <event id> | sweep';

function run(args: string[]): number {
  const [command, argument] = args;
  const config = loadConfig();
  const db = new Db(join(config.dataDir, 'owl.db'));
  try {
    migrate(db);
    switch (command) {
      case 'stats': {
        console.log(JSON.stringify(stats(db)));
        return 0;
      }
      case 'delete': {
        if (!argument || !isId(argument)) {
          console.error(
            'Give the id of the event: the 12 characters after /e/ in its link.'
          );
          return 2;
        }
        const deleted = deleteEvent(db, argument);
        db.checkpoint();
        console.log(deleted ? `Deleted ${argument}.` : `No event ${argument}.`);
        return deleted ? 0 : 1;
      }
      case 'sweep': {
        const ids = sweepExpired(db, todayUTC());
        db.checkpoint();
        console.log(`Deleted ${ids.length} expired event(s).`);
        return 0;
      }
      default:
        console.error(USAGE);
        return 2;
    }
  } finally {
    db.close();
  }
}

process.exit(run(process.argv.slice(2)));
