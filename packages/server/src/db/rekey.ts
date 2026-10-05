import { nameKey } from '@owl/shared';
import type { Db } from './sqlite.js';

/**
 * Which version of `nameKey` the stored `participants.name_key` values were
 * made with. Raise it whenever `nameKey` in `shared` changes what it returns:
 * the next start then recomputes the keys, and a person whose name was typed
 * under the old rules still finds their entry by name.
 *
 * Kept in `PRAGMA user_version`, which nothing else here uses — the migrations
 * keep their own list in `schema_migrations`.
 */
export const NAME_KEY_VERSION = 1;

export interface RekeyResult {
  /** Keys that were recomputed. */
  updated: number;
  /** Entries left as they were, because their new key is taken or empty. */
  skipped: number;
}

/**
 * Bring `participants.name_key` up to date with `nameKey`, once per version.
 *
 * An entry whose new key another entry of the same event already holds keeps
 * its old key: the two would collide on `UNIQUE (event_id, name_key)`, and
 * which of them is meant is not for the server to guess. The same goes for a
 * name that no longer has a key at all. Such an entry stays reachable by its
 * old key only; the count is returned, the names are not.
 *
 * Nothing happens when the database was keyed by this version or a newer one.
 * The whole step is one transaction, the version included.
 */
export function rekeyParticipants(
  db: Db,
  version: number = NAME_KEY_VERSION
): RekeyResult {
  if (!Number.isInteger(version) || version < 1) {
    throw new RangeError(`Not a key version: ${version}`);
  }
  return db.tx(() => {
    const stored = Number(
      db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0
    );
    const result: RekeyResult = { updated: 0, skipped: 0 };
    if (stored >= version) return result;
    const rows = db.all<{
      id: string;
      event_id: string;
      name: string;
      name_key: string;
    }>(
      'SELECT id, event_id, name, name_key FROM participants ORDER BY created_at, id'
    );
    for (const row of rows) {
      const key = nameKey(row.name);
      if (key === row.name_key) continue;
      const taken = db.get(
        'SELECT 1 FROM participants WHERE event_id = ? AND name_key = ? AND id <> ?',
        row.event_id,
        key,
        row.id
      );
      if (key === '' || taken) {
        result.skipped += 1;
        continue;
      }
      db.run('UPDATE participants SET name_key = ? WHERE id = ?', key, row.id);
      result.updated += 1;
    }
    db.exec(`PRAGMA user_version = ${version}`);
    return result;
  });
}
