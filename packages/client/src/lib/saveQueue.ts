import { joinMarks, sameMarks, splitMarks, type Marks } from '@owl/shared';
import { holdReload } from './reloadGuard.ts';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'retrying' | 'failed';

/** A stale answer may carry the server's marks, which the queue merges with. */
export type SendResult =
  // `yes` and `maybe` come with a save the server merged (see `touched`): the
  // marks it holds now, which differ from what was sent.
  | {
      ok: true;
      rev: number;
      yes?: string[] | undefined;
      maybe?: string[] | undefined;
    }
  | { ok: false; rev: number; yes?: string[]; maybe?: string[] };

export interface SaveRequest {
  baseRev: number;
  yes: string[];
  maybe: string[];
  /** The candidate days the client knew; filled in by the send function. */
  days?: string[];
  /**
   * Sent on leaving the page: the days this device changed. On a stale
   * revision the server applies just these on top of its current marks, where
   * otherwise it refuses — nobody is left to take the 409 and send again.
   */
  touched?: string[];
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

/** What the server holds after a save: its own merged set, else what was sent. */
function savedSet(result: SendResult, sent: Marks): Marks {
  return result.ok && result.yes && result.maybe
    ? joinMarks(result.yes, result.maybe)
    : sent;
}

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
 * taken and the person's changes are sent again on top of the server's marks:
 * what they last did wins, and days only another device touched stay.
 */
export class SaveQueue {
  private pending: Marks | null = null;
  // Stamps tell the newest state from an older one: the last pushed, and the
  // newest ever handed to the network.
  private seq = 0;
  private pendingSeq = 0;
  private sentSeq = 0;
  private landedSeq = 0;
  private inFlight = false;
  private leaving = 0;
  // Of those, the ones that merge on a stale revision. What they carry is
  // applied whenever they land, so nothing newer may be sent before they have
  // answered: a late merge would put the older state back over it.
  private merging = 0;
  private retry: unknown = null;
  private attempt = 0;
  private disposed = false;
  private failed = false;
  // Send what is pending once the request under way has answered, even from a
  // queue disposed of meanwhile: a panel went away mid-save.
  private drain = false;
  // What the screen showed when it last agreed with the server, and what the
  // server held then: a request is the server's marks plus the changes made
  // since. Null until known; then the whole local set goes out as it is.
  private viewBase: Marks | null = null;
  private serverBase: Marks | null = null;
  // Days a request may have changed since the server's marks were last known
  // to match ours: a lost answer must not turn our own mark into someone else's.
  private readonly touched = new Set<string>();
  private knownRev: number;
  baseRev: number;

  private readonly sendFn: (request: SaveRequest) => Promise<SendResult>;
  private readonly onStatus: (status: SaveStatus, error?: unknown) => void;
  private readonly onSaved: (rev: number) => void;
  private readonly onMerged: (marks: Marks) => void;
  private readonly timers: Timers;

  constructor(options: {
    baseRev: number;
    send: (request: SaveRequest) => Promise<SendResult>;
    onStatus?: (status: SaveStatus, error?: unknown) => void;
    onSaved?: (rev: number) => void;
    /** The saved set differs from the screen's: another device's marks joined. */
    onMerged?: (marks: Marks) => void;
    /** The marks the server holds at `baseRev`. */
    marks?: Marks;
    timers?: Timers;
  }) {
    this.baseRev = options.baseRev;
    this.knownRev = options.baseRev;
    if (options.marks) {
      this.viewBase = new Map(options.marks);
      this.serverBase = new Map(options.marks);
    }
    this.onMerged = options.onMerged ?? (() => undefined);
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
    this.pendingSeq = ++this.seq;
    this.failed = false;
    if (this.retry !== null) {
      // A new change is a good moment to try again right away.
      this.timers.clearTimeout(this.retry);
      this.retry = null;
    }
    if (!this.inFlight) void this.flush();
  }

  /**
   * Send what is pending without waiting, as the page goes away or is put in
   * the background. The send function is expected to use `keepalive`, so
   * that a request outlives the page, one already under way included.
   *
   * With a request under way the newest state still goes out, on the revision
   * known so far — never a guessed one. Which request the server handles first
   * is not ours to say: if the one under way, the older state, lands first, this
   * one is stale, and carries `touched` so that the server applies our days on
   * top of what it holds instead of refusing it; if this one lands first, the
   * older one is the stale one and is refused. Either way the last tap is
   * saved, and a day only another device touched is never overwritten.
   */
  flushOnLeave(): void {
    if (this.pending === null || this.disposed) return;
    // Without the marks the server holds there is no telling our days from
    // another device's, so a second request could only guess the revision the
    // first will make; the state follows its answer instead.
    const known = this.viewBase !== null && this.serverBase !== null;
    if (this.inFlight && !known) {
      this.drain = true;
      return;
    }
    const marks = this.pending;
    const markSeq = this.pendingSeq;
    this.pending = null;
    this.sentSeq = Math.max(this.sentSeq, markSeq);
    if (this.retry !== null) {
      this.timers.clearTimeout(this.retry);
      this.retry = null;
    }
    const { request, sent } = this.prepare(marks, true);
    const merges = request.touched !== undefined;
    this.leaving += 1;
    if (merges) this.merging += 1;
    this.sendFn(request).then(
      (result) => {
        this.leaving -= 1;
        if (merges) this.merging -= 1;
        this.afterLeave(marks, sent, markSeq, result);
      },
      (error: unknown) => {
        this.leaving -= 1;
        if (merges) this.merging -= 1;
        this.afterLeaveFailed(marks, markSeq, error);
      }
    );
  }

  /**
   * The page may live on after `flushOnLeave` (a tab put in the background),
   * so what came back is taken in; a page that is really gone ignores it.
   */
  private afterLeave(
    marks: Marks,
    sent: Marks,
    markSeq: number,
    result: SendResult
  ): void {
    if (this.disposed) return;
    if (result.ok) {
      this.landed(marks, savedSet(result, sent), markSeq, result.rev);
      this.baseRev = Math.max(this.baseRev, result.rev);
      this.landedSeq = Math.max(this.landedSeq, markSeq);
      this.onSaved(result.rev);
      // A save that failed meanwhile left what came after it waiting for this.
      if (this.pending !== null && !this.inFlight && this.retry === null)
        void this.flush();
      else if (!this.busy) this.setStatus('saved');
      return;
    }
    // Refused as stale: with a request under way its answer brings the
    // revision; otherwise take the server's and resend.
    this.noteServer(result);
    this.restore(marks, markSeq);
    if (!this.inFlight && this.retry === null) {
      this.baseRev = Math.max(this.baseRev, result.rev);
      if (this.pending !== null) void this.flush();
    }
    this.settle();
  }

  private afterLeaveFailed(
    marks: Marks,
    markSeq: number,
    error: unknown
  ): void {
    if (this.disposed) return;
    this.restore(marks, markSeq);
    if (error instanceof PermanentSaveError) {
      this.pending = null;
      this.failed = true;
      this.setStatus('failed', error);
    } else if (this.pending !== null && !this.inFlight && this.retry === null) {
      this.scheduleRetry(error);
    } else {
      this.settle();
    }
  }

  /** 'saved' once nothing is waiting and the newest state sent has landed. */
  private settle(): void {
    if (!this.failed && !this.busy && this.landedSeq >= this.sentSeq)
      this.setStatus('saved');
  }

  /** The server's marks from a stale answer, if it is the newest we know. */
  private noteServer(result: SendResult): void {
    if (result.ok || !result.yes || !result.maybe) return;
    if (result.rev < this.knownRev) return;
    this.knownRev = result.rev;
    this.serverBase = joinMarks(result.yes, result.maybe);
  }

  /** A save landed: the server now holds `sent`, the screen showed `marks`. */
  private landed(
    marks: Marks,
    sent: Marks,
    markSeq: number,
    rev: number
  ): void {
    if (markSeq < this.landedSeq || rev < this.knownRev) return;
    this.knownRev = rev;
    this.viewBase = new Map(marks);
    this.serverBase = new Map(sent);
    if (this.pending === null && !this.inFlight && this.leaving === 0)
      this.touched.clear();
    // Nothing newer on screen: show the marks that joined ours.
    if (this.seq === markSeq && !sameMarks(marks, sent)) {
      this.viewBase = new Map(sent);
      this.onMerged(sent);
    }
  }

  /** The request for `marks`, and the set it will leave on the server. */
  private prepare(
    marks: Marks,
    leaving = false
  ): { request: SaveRequest; sent: Marks } {
    const { viewBase, serverBase } = this;
    let sent = marks;
    if (viewBase && serverBase) {
      for (const day of new Set([...marks.keys(), ...viewBase.keys()]))
        if (marks.get(day) !== viewBase.get(day)) this.touched.add(day);
      // Our changes on the server's set; the days nobody here touched stay.
      const merged = new Map(serverBase);
      for (const day of this.touched) {
        const mine = marks.get(day);
        if (mine === undefined) merged.delete(day);
        else merged.set(day, mine);
      }
      sent = merged;
    }
    return {
      request: {
        baseRev: this.baseRev,
        ...splitMarks(sent),
        ...(leaving &&
          viewBase &&
          serverBase && { touched: [...this.touched].sort() }),
      },
      sent,
    };
  }

  /** Take the server's marks, for a screen that has just adopted them. */
  adopt(rev: number, marks: Marks): void {
    if (this.busy) return;
    this.baseRev = Math.max(this.baseRev, rev);
    if (rev < this.knownRev) return;
    this.knownRev = rev;
    this.viewBase = new Map(marks);
    this.serverBase = new Map(marks);
    this.touched.clear();
  }

  /** Put an unsent state back, unless a newer one is pending or went out. */
  private restore(marks: Marks, markSeq: number): void {
    if (this.pending !== null || markSeq < this.sentSeq) return;
    this.pending = marks;
    this.pendingSeq = markSeq;
  }

  /** Stop retrying; whatever is pending is dropped, now and until `revive`. */
  dispose(): void {
    this.disposed = true;
    if (this.retry !== null) this.timers.clearTimeout(this.retry);
    this.retry = null;
    // A state waiting for the request under way still goes out after it.
    if (!this.drain) this.pending = null;
  }

  /**
   * Take a queue back into use after `dispose`. React's StrictMode runs an
   * effect's cleanup and then its setup again on the very same objects, so a
   * queue disposed of in that cleanup has to be able to start over. A request
   * that was under way meanwhile carries on as if nothing had happened.
   */
  revive(): void {
    this.disposed = false;
    this.drain = false;
  }

  /**
   * Wire the queue to the page: send what is pending when the page is hidden
   * or unloaded. Returns the undo for an effect's cleanup: it sends what is
   * still pending — a panel that goes away without the page doing so, such as
   * after "Not you" or the organiser's fill-in, must not lose the last marks — removes the
   * listeners and disposes of the queue.
   */
  attach(): () => void {
    this.revive();
    const release = holdReload(() => this.busy);
    const leave = (): void => this.flushOnLeave();
    const hide = (): void => {
      if (document.visibilityState === 'hidden') this.flushOnLeave();
    };
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('pagehide', leave);
      document.removeEventListener('visibilitychange', hide);
      release();
      this.flushOnLeave();
      this.dispose();
    };
  }

  private setStatus(status: SaveStatus, error?: unknown): void {
    this.onStatus(status, error);
  }

  private async flush(): Promise<void> {
    const marks = this.pending;
    if (marks === null || (this.disposed && !this.drain)) return;
    // The answer to a merging leave request resumes sending.
    if (this.merging > 0) return;
    const markSeq = this.pendingSeq;
    this.pending = null;
    if (this.disposed) this.drain = false;
    this.sentSeq = Math.max(this.sentSeq, markSeq);
    this.inFlight = true;
    this.setStatus('saving');
    try {
      const { request, sent } = this.prepare(marks);
      const result = await this.sendFn(request);
      this.attempt = 0;
      this.inFlight = false;
      if (result.ok) {
        this.landed(marks, sent, markSeq, result.rev);
        this.baseRev = Math.max(this.baseRev, result.rev);
        this.landedSeq = Math.max(this.landedSeq, markSeq);
        this.onSaved(result.rev);
      } else {
        // Someone else saved in between — another device, or a request that
        // overtook this one. Take their revision; resend our latest state.
        this.noteServer(result);
        this.baseRev = Math.max(this.baseRev, result.rev);
        this.restore(marks, markSeq);
      }
      if (this.pending !== null) await this.flush();
      else if (result.ok || this.leaving === 0) this.setStatus('saved');
    } catch (error) {
      this.inFlight = false;
      // A request that was under way when the queue was disposed of is not
      // retried: nobody is left to see it, and it would retry for ever.
      if (this.disposed) return;
      this.restore(marks, markSeq);
      // A request sent on leaving is still to answer: its answer carries on.
      if (this.leaving > 0) return;
      if (error instanceof PermanentSaveError) {
        this.pending = null;
        this.failed = true;
        this.setStatus('failed', error);
        return;
      }
      // Overtaken by a newer state: 'saved' only if that one landed, not failed.
      if (this.pending === null) {
        if (this.landedSeq >= this.sentSeq) this.setStatus('saved');
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
