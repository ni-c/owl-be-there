import { chmodSync } from 'node:fs';
import {
  DatabaseSync,
  type SQLInputValue,
  type StatementSync,
} from 'node:sqlite';

/** How long a request waits for readers before it leaves the checkpoint to later. */
const REQUEST_CHECKPOINT_MS = 100;

/** Pauses between retries of a checkpoint a reader held up, the last repeating. */
export const CHECKPOINT_RETRY_MS = [1000, 2000, 5000, 15_000, 60_000];

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
  private retry: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;

  constructor(path: string) {
    this.db = new DatabaseSync(path, { enableForeignKeyConstraints: true });
    if (path !== ':memory:' && path !== '') {
      // Names, notes and event links are in this file: the owner only. SQLite
      // gives the -wal and -shm files the mode of the database file, so this
      // comes before the journal mode creates them; ones left by an earlier
      // run are tightened too.
      for (const file of [path, `${path}-wal`, `${path}-shm`]) restrict(file);
    }
    // WAL lets readers proceed while a write commits. An in-memory database
    // answers `memory` instead, which is fine.
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
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

  /** Whether a write transaction is open. */
  get inTransaction(): boolean {
    return this.depth > 0;
  }

  private nested<T>(fn: () => T): T {
    this.depth += 1;
    try {
      return fn();
    } finally {
      this.depth -= 1;
    }
  }

  /**
   * Fold the write-ahead log back into the database file and truncate it.
   * Returns false when a reader (the command line, say) kept it from finishing
   * within `waitMs`; the log is then folded in by a later checkpoint.
   */
  checkpoint(waitMs = 5000): boolean {
    this.db.exec(`PRAGMA busy_timeout = ${Math.trunc(waitMs)}`);
    try {
      const row = this.get<{ busy: number }>('PRAGMA wal_checkpoint(TRUNCATE)');
      return row === undefined || Number(row.busy) === 0;
    } finally {
      this.db.exec('PRAGMA busy_timeout = 5000');
    }
  }

  /**
   * The checkpoint a request makes after taking a name or a text out: it waits
   * only {@link REQUEST_CHECKPOINT_MS}, so a reader cannot hold the request up.
   * If a reader did keep it from finishing, the removed text still sits in the
   * log, so it is tried again in the background (with the same short wait, a
   * pause at a time, longer each time) until it goes through.
   */
  requestCheckpoint(): boolean {
    if (this.checkpoint(REQUEST_CHECKPOINT_MS)) {
      this.cancelRetry();
      return true;
    }
    this.scheduleRetry();
    return false;
  }

  private scheduleRetry(): void {
    if (this.retry !== null) return;
    const delay =
      CHECKPOINT_RETRY_MS[
        Math.min(this.retries, CHECKPOINT_RETRY_MS.length - 1)
      ]!;
    this.retries += 1;
    this.retry = setTimeout(() => {
      this.retry = null;
      if (!this.db.isOpen) return;
      try {
        if (this.checkpoint(REQUEST_CHECKPOINT_MS)) this.retries = 0;
        else this.scheduleRetry();
      } catch {
        this.scheduleRetry();
      }
    }, delay);
    // A pending retry must not keep the process from stopping.
    this.retry.unref();
  }

  private cancelRetry(): void {
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    this.retries = 0;
  }

  /**
   * The data in bytes: pages in use times the page size. Free pages are left
   * out — the file never shrinks, but they are reused before it grows.
   */
  sizeBytes(): number {
    const pages = this.get<{ page_count: number }>('PRAGMA page_count');
    const free = this.get<{ freelist_count: number }>('PRAGMA freelist_count');
    const size = this.get<{ page_size: number }>('PRAGMA page_size');
    const used =
      Number(pages?.page_count ?? 0) - Number(free?.freelist_count ?? 0);
    return used * Number(size?.page_size ?? 0);
  }

  close(): void {
    this.cancelRetry();
    this.statements.clear();
    if (this.db.isOpen) this.db.close();
  }
}

/** Owner-only access to a file, if it exists. */
function restrict(file: string): void {
  try {
    chmodSync(file, 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function isThenable(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
