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
  private leaving = 0;
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
    return (
      this.inFlight ||
      this.leaving > 0 ||
      this.pending !== null ||
      this.retry !== null
    );
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
   * Send what is pending without waiting, as the page goes away or is put in
   * the background. Every save is sent with `keepalive`, so one already under
   * way outlives the page too.
   */
  flushOnLeave(): void {
    if (this.pending === null || this.disposed) return;
    const marks = this.pending;
    this.pending = null;
    if (!this.inFlight && this.retry !== null) {
      this.timers.clearTimeout(this.retry);
      this.retry = null;
    }
    // With a request still travelling, the newest state goes out too, based on
    // the revision that request will make if it lands — otherwise the last
    // change before closing the page would be lost. Should it not land, the
    // server refuses this one as stale, which loses nothing more than before.
    const request = this.requestFor(marks);
    if (this.inFlight) request.baseRev += 1;
    this.leaving += 1;
    this.sendFn(request, true).then(
      (result) => {
        this.leaving -= 1;
        this.afterLeave(marks, result);
      },
      (error: unknown) => {
        this.leaving -= 1;
        this.afterLeaveFailed(marks, error);
      }
    );
  }

  /**
   * The page may live on after `flushOnLeave` (a tab put in the background),
   * so what came back is taken in; a page that is really gone ignores it.
   */
  private afterLeave(marks: Marks, result: SendResult): void {
    if (this.disposed) return;
    if (result.ok) {
      this.baseRev = Math.max(this.baseRev, result.rev);
      this.onSaved(result.rev);
      if (!this.busy) this.setStatus('saved');
      return;
    }
    // Refused as stale: with a request still under way that is expected, and
    // its answer brings the revision; otherwise take the server's and resend.
    this.pending ??= marks;
    if (!this.inFlight && this.retry === null) {
      this.baseRev = result.rev;
      void this.flush();
    }
  }

  private afterLeaveFailed(marks: Marks, error: unknown): void {
    if (this.disposed) return;
    this.pending ??= marks;
    if (error instanceof PermanentSaveError) {
      this.pending = null;
      this.setStatus('failed', error);
    } else if (!this.inFlight && this.retry === null) {
      this.scheduleRetry(error);
    }
  }

  /** Stop retrying; whatever is pending is dropped, now and until `revive`. */
  dispose(): void {
    this.disposed = true;
    if (this.retry !== null) this.timers.clearTimeout(this.retry);
    this.retry = null;
    this.pending = null;
  }

  /**
   * Take a queue back into use after `dispose`. React's StrictMode runs an
   * effect's cleanup and then its setup again on the very same objects, so a
   * queue disposed of in that cleanup has to be able to start over. A request
   * that was under way meanwhile carries on as if nothing had happened.
   */
  revive(): void {
    this.disposed = false;
  }

  /**
   * Wire the queue to the page: send what is pending when the page is hidden
   * or unloaded. Returns the undo for an effect's cleanup: it sends what is
   * still pending — a panel that goes away without the page doing so, such as
   * the Group tab on a phone, must not lose the last marks — removes the
   * listeners and disposes of the queue.
   */
  attach(): () => void {
    this.revive();
    const leave = (): void => this.flushOnLeave();
    const hide = (): void => {
      if (document.visibilityState === 'hidden') this.flushOnLeave();
    };
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('pagehide', leave);
      document.removeEventListener('visibilitychange', hide);
      this.flushOnLeave();
      this.dispose();
    };
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
      const result = await this.sendFn(this.requestFor(marks), true);
      this.attempt = 0;
      this.inFlight = false;
      if (result.ok) {
        this.baseRev = result.rev;
        this.onSaved(result.rev);
      } else {
        // Someone else saved in between — another device, or a request that
        // overtook this one. Take their revision; resend our latest state.
        this.baseRev = result.rev;
        // A newer state already sent on leaving is not to be overtaken by
        // this older one; its answer decides what happens next.
        if (this.leaving === 0) this.pending ??= marks;
      }
      if (this.pending !== null) await this.flush();
      else if (result.ok || this.leaving === 0) this.setStatus('saved');
    } catch (error) {
      this.inFlight = false;
      // A request that was under way when the queue was disposed of is not
      // retried: nobody is left to see it, and it would retry for ever.
      if (this.disposed) return;
      // The same goes for a failure: what was sent on leaving answers for the
      // newest state.
      if (this.leaving > 0) return;
      this.pending ??= marks;
      if (error instanceof PermanentSaveError) {
        this.pending = null;
        this.setStatus('failed', error);
        return;
      }
      this.scheduleRetry(error);
    }
  }

  /** Try again after a pause that grows with each failure in a row. */
  private scheduleRetry(error: unknown): void {
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

/** The marks a conflict carried, for adopting them when nothing is pending. */
export const marksOf = (yes: string[], maybe: string[]): Marks =>
  joinMarks(yes, maybe);
