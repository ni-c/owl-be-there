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
export const NAME_KEY_VERSION = 3;

export interface RekeyResult {
  /** Keys that were recomputed. */
  updated: number;
  /** Entries left as they were, because their new key is taken or empty. */
  skipped: number;
}

/**
 * Bring `participants.name_key` up to date with `nameKey`, once per version.
 *
 * Two entries of one event that would end up with the same key would collide
 * on `UNIQUE (event_id, name_key)`, and which of them is meant is not for the
 * server to guess: the older one takes the key and the younger keeps its old
 * one. An entry already sitting on a key keeps it against any newcomer, so the
 * result does not depend on the order the rows are read in. A name that no
 * longer has a key at all keeps its old key as well. Such an entry stays
 * reachable by its old key only; the count is returned, the names are not.
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
    const rows = db
      .all<{
        id: string;
        event_id: string;
        name: string;
        name_key: string;
      }>(
        'SELECT id, event_id, name, name_key FROM participants ORDER BY created_at, id'
      )
      .map((row) => {
        const wanted = nameKey(row.name);
        return { ...row, wanted, final: wanted === '' ? row.name_key : wanted };
      });
    // Settle the collisions: in a group that shares a key the winner is a row
    // that cannot move (it is on its old key), else the oldest; the others go
    // back to their old keys, which can in turn collide, so go round again.
    for (let changed = true; changed;) {
      changed = false;
      const groups = new Map<string, typeof rows>();
      for (const row of rows) {
        const id = `${row.event_id}\u0000${row.final}`;
        groups.set(id, [...(groups.get(id) ?? []), row]);
      }
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        const winner =
          group.find((row) => row.final === row.name_key) ?? group[0]!;
        for (const row of group) {
          if (row === winner) continue;
          row.final = row.name_key;
          changed = true;
        }
      }
    }
    const moving = rows.filter((row) => row.final !== row.name_key);
    // Through a key nobody has, so a swap does not trip the unique index.
    for (const row of moving) {
      db.run(
        'UPDATE participants SET name_key = ? WHERE id = ?',
        `\u0000rekey:${row.id}`,
        row.id
      );
    }
    for (const row of moving) {
      db.run(
        'UPDATE participants SET name_key = ? WHERE id = ?',
        row.final,
        row.id
      );
    }
    result.updated = moving.length;
    result.skipped = rows.filter(
      (row) => row.wanted !== row.name_key && row.final === row.name_key
    ).length;
    db.exec(`PRAGMA user_version = ${version}`);
    return result;
  });
}
