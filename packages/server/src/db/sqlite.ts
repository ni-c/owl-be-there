import {
  DatabaseSync,
  type SQLInputValue,
  type StatementSync,
} from 'node:sqlite';

/**
 * The one module that imports `node:sqlite`.
 *
 * The built-in driver is a release candidate in Node 26: stable enough to run
 * on, young enough that a detail of its API may still move. Everything else in
 * the server talks to this class, so such a change is a change in one file.
 *
 * Synchronous, like the driver. With one connection and no `await` inside a
 * transaction, a transaction cannot interleave with another request — which is
 * why {@link Db.tx} refuses a function that returns a promise.
 */
export class Db {
  private readonly db: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();
  private depth = 0;

  constructor(path: string) {
    this.db = new DatabaseSync(path, { enableForeignKeyConstraints: true });
    // WAL lets readers proceed while a write commits. An in-memory database
    // answers `memory` instead, which is fine.
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec('PRAGMA busy_timeout = 5000');
    // Deleted rows are overwritten rather than left in free pages: when an
    // event is deleted, its names should really be gone from the file.
    this.db.exec('PRAGMA secure_delete = ON');
    this.db.exec('PRAGMA trusted_schema = OFF');
    this.db.exec('PRAGMA temp_store = MEMORY');
  }

  /** A prepared statement, compiled once per distinct SQL text. */
  private statement(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.db.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }

  run(sql: string, ...params: SQLInputValue[]): number {
    return Number(this.statement(sql).run(...params).changes);
  }

  get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.statement(sql).get(...params) as T | undefined;
  }

  all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.statement(sql).all(...params) as T[];
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * Run `fn` in a write transaction, committing on return and rolling back on
   * a throw. Nested calls join the outer transaction, so a repository function
   * can be one step of a bigger operation without a second BEGIN.
   */
  tx<T>(fn: () => T): T {
    if (this.depth > 0) return this.nested(fn);
    this.db.exec('BEGIN IMMEDIATE');
    this.depth = 1;
    try {
      const result = fn();
      if (isThenable(result)) {
        throw new TypeError('A transaction function must not be async');
      }
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      // SQLite may have rolled back on its own (a full disk, an I/O error);
      // then ROLLBACK fails too, and the first error is the one that matters.
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // already rolled back
      }
      throw error;
    } finally {
      this.depth = 0;
    }
  }

  private nested<T>(fn: () => T): T {
    this.depth += 1;
    try {
      return fn();
    } finally {
      this.depth -= 1;
    }
  }

  /** Fold the write-ahead log back into the database file and truncate it. */
  checkpoint(): void {
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }

  close(): void {
    this.statements.clear();
    if (this.db.isOpen) this.db.close();
  }
}

function isThenable(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
