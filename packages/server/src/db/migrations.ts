import { createHash } from 'node:crypto';
import type { Db } from './sqlite.js';

interface Migration {
  version: number;
  sql: string;
}

/**
 * The schema, as a list that is only ever appended to.
 *
 * Every table is STRICT, so a wrong type is an error rather than a silent
 * conversion. Days are `YYYY-MM-DD` text, moments are Unix milliseconds.
 *
 * What the shape encodes, so the database itself guarantees it:
 * - "no" is the absence of a row in `marks`; "not answered" is
 *   `participants.marks_at IS NULL` — the two are never confused.
 * - A mark references its candidate day, so removing a day removes every mark
 *   on it, and a mark on a day that is not a candidate cannot exist.
 * - A chosen date implies a closed poll.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  admin_hash TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  description TEXT CHECK (description IS NULL OR length(description) <= 500),
  location TEXT CHECK (location IS NULL OR length(location) <= 120),
  emoji TEXT NOT NULL,
  creator_name TEXT CHECK (creator_name IS NULL OR length(creator_name) <= 40),
  language TEXT NOT NULL CHECK (language IN ('en', 'de')),
  duration_days INTEGER NOT NULL CHECK (duration_days BETWEEN 1 AND 14),
  min_count INTEGER CHECK (min_count IS NULL OR min_count >= 1),
  closed_at INTEGER,
  final_start TEXT,
  final_end TEXT,
  created_at INTEGER NOT NULL,
  last_write_at INTEGER NOT NULL,
  expires_on TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK ((final_start IS NULL) = (final_end IS NULL)),
  CHECK (final_start IS NULL OR closed_at IS NOT NULL)
) STRICT;

CREATE INDEX events_expires_on ON events (expires_on);

CREATE TABLE event_days (
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, day)
) STRICT, WITHOUT ROWID;

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  name_key TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('roster', 'self')),
  password_hash TEXT,
  token_gen INTEGER NOT NULL DEFAULT 0,
  note TEXT CHECK (note IS NULL OR length(note) <= 140),
  marks_at INTEGER,
  rev INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (event_id, name_key),
  UNIQUE (id, event_id)
) STRICT;

CREATE INDEX participants_event ON participants (event_id);

CREATE TABLE marks (
  participant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  day TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('yes', 'maybe')),
  PRIMARY KEY (participant_id, day),
  FOREIGN KEY (participant_id, event_id)
    REFERENCES participants (id, event_id) ON DELETE CASCADE,
  FOREIGN KEY (event_id, day)
    REFERENCES event_days (event_id, day) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE INDEX marks_event_day ON marks (event_id, day);
`,
  },
];

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

const checksum = (sql: string): string =>
  createHash('sha256').update(sql).digest('hex');

/**
 * Bring the database up to date, or refuse to start.
 *
 * An applied migration whose text has changed since is an error, not a
 * warning — the database no longer matches what the code believes it is. So is
 * a database newer than the code: running an old release against it would
 * write rows the newer schema never expected.
 */
export function migrate(
  db: Db,
  migrations: readonly Migration[] = MIGRATIONS
): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  ) STRICT`);
  const applied = db.all<{ version: number; checksum: string }>(
    'SELECT version, checksum FROM schema_migrations ORDER BY version'
  );
  const known = new Map(migrations.map((m) => [m.version, m]));
  for (const row of applied) {
    const migration = known.get(row.version);
    if (!migration) {
      throw new MigrationError(
        `The database has migration ${row.version}, which this release does not know. Is it older than the data?`
      );
    }
    if (checksum(migration.sql) !== row.checksum) {
      throw new MigrationError(
        `Migration ${row.version} was changed after it was applied.`
      );
    }
  }
  const done = new Set(applied.map((row) => row.version));
  let count = 0;
  for (const migration of migrations) {
    if (done.has(migration.version)) continue;
    db.tx(() => {
      db.exec(migration.sql);
      db.run(
        'INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)',
        migration.version,
        checksum(migration.sql),
        Date.now()
      );
    });
    count += 1;
  }
  return count;
}
