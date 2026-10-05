import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildApp } from './app.js';
import { loadSecret } from './auth/secret.js';
import { ConfigError, loadConfig } from './config.js';
import { migrate } from './db/migrations.js';
import { rekeyParticipants } from './db/rekey.js';
import { Db } from './db/sqlite.js';

/** How often expired events are swept out. Their last day is a whole day. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/** How long a shutdown may take before the process gives up waiting. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }

  // The database and the secret are for this process alone.
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const db = new Db(join(config.dataDir, 'owl.db'));
  migrate(db);
  const rekeyed = rekeyParticipants(db);
  const secret = loadSecret(config.dataDir, config.secret);
  let app;
  try {
    app = await buildApp({ config, db, secret });
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      db.close();
      process.exit(2);
    }
    throw error;
  }

  if (rekeyed.updated > 0 || rekeyed.skipped > 0) {
    // Counts only: neither a name nor an event belongs in a log.
    app.log.info(rekeyed, 'participant name keys brought up to date');
  }
  if (rekeyed.skipped > 0) {
    app.log.warn(
      { skipped: rekeyed.skipped },
      'some participant name keys were kept: their new key is taken or empty'
    );
  }

  const sweep = (): void => {
    try {
      app.sweep();
    } catch (error) {
      app.log.error({ err: error }, 'sweeping expired events failed');
    }
  };
  sweep();
  const sweeper = setInterval(sweep, SWEEP_INTERVAL_MS);
  sweeper.unref();

  // The process is PID 1 in the container, so it handles the signals itself:
  // close the server, then the database, so the WAL is folded back cleanly.
  let stopping = false;
  const stop = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, 'shutting down');
    clearInterval(sweeper);
    // A connection that will not close must not keep the container from
    // stopping; the orchestrator would kill it less gracefully anyway.
    setTimeout(() => {
      app.log.error('shutdown took too long; exiting');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    try {
      await app.close();
      db.checkpoint();
      db.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'shutting down failed');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));

  await app.listen({ host: config.host, port: config.port });
  app.log.info({ publicUrl: config.publicUrl }, 'Owl Be There is listening');
}

await main();
