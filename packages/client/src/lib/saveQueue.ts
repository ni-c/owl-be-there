import { joinMarks, splitMarks, type Marks } from '@owl/shared';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'retrying' | 'failed';

export type SendResult =
  | { ok: true; rev: number }
  | { ok: false; rev: number; yes: string[]; maybe: string[] };

export interface SaveRequest {
  baseRev: number;
  yes: string[];
  maybe: string[];
}

/** A failure that retrying cannot fix — a revoked token, a closed poll. */
export class PermanentSaveError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'PermanentSaveError';
    this.code = code;
  }
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Seconds between retries after a network error, the last one repeating. */
export const RETRY_DELAYS_MS = [1000, 2000, 5000, 10_000];

/**
 * Auto-save for one participant's marks.
 *
 * At most one request is in flight. Changes made meanwhile collapse into one
 * pending state — always the whole set, so the newest state is all that ever
 * needs sending. Every request carries the revision it was based on, and the
 * server refuses one based on an old revision, so a slow or retried request
 * can never overwrite a newer save. When that happens the server's revision is
 * taken and the person's latest state is sent again: what they last did wins.
 */
export class SaveQueue {
  private pending: Marks | null = null;
  private inFlight = false;
  private retry: unknown = null;
  private attempt = 0;
  private disposed = false;
  private status: SaveStatus = 'idle';
  baseRev: number;

  private readonly sendFn: (
    request: SaveRequest,
    keepalive: boolean
  ) => Promise<SendResult>;
  private readonly onStatus: (status: SaveStatus, error?: unknown) => void;
  private readonly onSaved: (rev: number) => void;
  private readonly timers: Timers;

  constructor(options: {
    baseRev: number;
    send: (request: SaveRequest, keepalive: boolean) => Promise<SendResult>;
    onStatus?: (status: SaveStatus, error?: unknown) => void;
    onSaved?: (rev: number) => void;
    timers?: Timers;
  }) {
    this.baseRev = options.baseRev;
    this.sendFn = options.send;
    this.onStatus = options.onStatus ?? (() => undefined);
    this.onSaved = options.onSaved ?? (() => undefined);
    this.timers = options.timers ?? realTimers;
  }

  /** Whether anything is waiting or travelling. */
  get busy(): boolean {
    return this.inFlight || this.pending !== null || this.retry !== null;
  }

  /** Queue the complete, current state of the marks. */
  push(marks: Marks): void {
    this.pending = new Map(marks);
    if (this.retry !== null) {
      // A new change is a good moment to try again right away.
      this.timers.clearTimeout(this.retry);
      this.retry = null;
    }
    if (!this.inFlight) void this.flush();
  }

  /**
   * Send what is pending without waiting, as the page goes away. `keepalive`
   * lets the request outlive the page.
   */
  flushOnLeave(): void {
    if (this.pending === null || this.disposed) return;
    const marks = this.pending;
    this.pending = null;
    // With a request still travelling, the newest state goes out too, based on
    // the revision that request will make if it lands — otherwise the last
    // change before closing the page would be lost. Should it not land, the
    // server refuses this one as stale, which loses nothing more than before.
    const request = this.requestFor(marks);
    if (this.inFlight) request.baseRev += 1;
    void this.sendFn(request, true).catch(() => undefined);
  }

  /** Stop retrying; whatever is pending is dropped, now and later. */
  dispose(): void {
    this.disposed = true;
    if (this.retry !== null) this.timers.clearTimeout(this.retry);
    this.retry = null;
    this.pending = null;
  }

  private requestFor(marks: Marks): SaveRequest {
    return { baseRev: this.baseRev, ...splitMarks(marks) };
  }

  private setStatus(status: SaveStatus, error?: unknown): void {
    this.status = status;
    this.onStatus(status, error);
  }

  get currentStatus(): SaveStatus {
    return this.status;
  }

  private async flush(): Promise<void> {
    const marks = this.pending;
    if (marks === null || this.disposed) return;
    this.pending = null;
    this.inFlight = true;
    this.setStatus('saving');
    try {
      const result = await this.sendFn(this.requestFor(marks), false);
      this.attempt = 0;
      this.inFlight = false;
      if (result.ok) {
        this.baseRev = result.rev;
        this.onSaved(result.rev);
      } else {
        // Someone else saved in between — another device, or a request that
        // overtook this one. Take their revision; resend our latest state.
        this.baseRev = result.rev;
        this.pending ??= marks;
      }
      if (this.pending !== null) await this.flush();
      else this.setStatus('saved');
    } catch (error) {
      this.inFlight = false;
      // A request that was under way when the queue was disposed of is not
      // retried: nobody is left to see it, and it would retry for ever.
      if (this.disposed) return;
      this.pending ??= marks;
      if (error instanceof PermanentSaveError) {
        this.pending = null;
        this.setStatus('failed', error);
        return;
      }
      const delay =
        RETRY_DELAYS_MS[Math.min(this.attempt, RETRY_DELAYS_MS.length - 1)]!;
      this.attempt += 1;
      this.setStatus('retrying', error);
      this.retry = this.timers.setTimeout(() => {
        this.retry = null;
        void this.flush();
      }, delay);
    }
  }
}

/** The marks a conflict carried, for adopting them when nothing is pending. */
export const marksOf = (yes: string[], maybe: string[]): Marks =>
  joinMarks(yes, maybe);
