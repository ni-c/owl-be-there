import { snapshotEtag, type EventSnapshotData } from '@owl/shared';
import { api, ApiFailure, streamUrl } from './api.ts';
import { Observable } from './observable.ts';

export type EventState =
  | { status: 'loading' }
  | { status: 'ready'; data: EventSnapshotData; stale: boolean }
  | { status: 'not-found' }
  | { status: 'deleted' }
  | { status: 'error' };

/** How long to wait after a "changed" before fetching — changes come in bursts. */
const REFETCH_DELAY_MS = 400;
/** How often to poll when the live stream is refused or unavailable. */
const POLL_MS = 30_000;
/** How long to poll before trying the live stream again. */
const STREAM_RETRY_MS = 5 * 60_000;
/** How long a stream may stay CONNECTING, at the start or after a drop, before polling takes over. */
const STREAM_OPEN_MS = 15_000;
/** Errors in a row without this stream ever opening that count as a dead one. */
const STREAM_CONNECT_ERRORS = 2;
/** The longest pause between attempts to catch up with an announced version. */
const CATCH_UP_MAX_MS = 30_000;
/** EventSource.CONNECTING, which the test doubles do not define. */
const CONNECTING = 0;

/**
 * One event as the client knows it: the latest snapshot, kept fresh by the
 * server's live stream.
 *
 * The stream only says "changed to version n". The store then fetches the
 * snapshot with the ETag it has, so a change this browser made itself — whose
 * response it has already applied — costs a 304 and nothing more.
 */
export class EventStore extends Observable<EventState> {
  private etag: string | null = null;
  private source: EventSource | null = null;
  private refetchTimer: ReturnType<typeof setTimeout> | null = null;
  /** The pending refetch timer is a (possibly long) catch-up wait. */
  private refetchIsCatchUp = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private streamRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private fetching: Promise<void> | null = null;
  private stopped = false;
  private unlisten: (() => void) | null = null;
  /** The newest version the stream has announced, -1 before any. */
  private announced = -1;
  /** Catch-up fetches in a row that did not reach the announced version. */
  private catchUpMisses = 0;
  readonly id: string;

  constructor(id: string) {
    super({ status: 'loading' });
    this.id = id;
  }

  start(): void {
    this.stopped = false;
    void this.refresh();
    this.openStream();
    this.listenForReturn();
  }

  stop(): void {
    this.stopped = true;
    this.source?.close();
    this.source = null;
    this.clearOpenTimer();
    if (this.refetchTimer) clearTimeout(this.refetchTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.streamRetryTimer) clearTimeout(this.streamRetryTimer);
    this.refetchTimer = null;
    this.refetchIsCatchUp = false;
    this.pollTimer = null;
    this.streamRetryTimer = null;
    this.unlisten?.();
    this.unlisten = null;
  }

  /** Fetch now, unless a fetch is already under way. */
  refresh(): Promise<void> {
    this.fetching ??= this.fetchOnce().finally(() => {
      this.fetching = null;
    });
    return this.fetching;
  }

  private async fetchOnce(): Promise<void> {
    let failed = false;
    try {
      failed = await this.fetchAndApply();
    } finally {
      this.catchUp(failed);
    }
  }

  /** One GET, applied to the state. Whether it failed. */
  private async fetchAndApply(): Promise<boolean> {
    try {
      const result = await api.getEvent(this.id, this.etag);
      if (this.stopped) return false;
      if (result === null) {
        if (this.state.status === 'ready' && this.state.stale) {
          this.set({ ...this.state, stale: false });
        }
        return false;
      }
      this.accept(result.data, result.etag);
      return false;
    } catch (error) {
      if (this.stopped) return false;
      // Only the API's own "no such event" means gone; a proxy's 404 page
      // is a failure like any other.
      if (
        error instanceof ApiFailure &&
        error.status === 404 &&
        error.code === 'not_found'
      ) {
        this.set(
          this.state.status === 'ready'
            ? { status: 'deleted' }
            : { status: 'not-found' }
        );
        this.stop();
        return false;
      }
      if (this.state.status === 'ready') {
        // Keep showing what we have; say it may be out of date.
        this.set({ ...this.state, stale: true });
      } else {
        this.set({ status: 'error' });
      }
      return true;
    }
  }

  private shownVersion(): number {
    return this.state.status === 'ready' ? this.state.data.event.version : -1;
  }

  /** An announced version is ahead of the shown one, or the last GET failed. */
  private isBehind(): boolean {
    const stale = this.state.status === 'ready' && this.state.stale;
    return stale || this.announced > this.shownVersion();
  }

  /**
   * An announcement is said once. When the fetch it set off failed, or ran
   * into a request that was already under way and brought an older snapshot
   * home, nothing would ask again; nor would anything after a failed refresh
   * nobody announced (a phone waking up). So while the store is behind the
   * newest version heard of, or stale, it keeps asking, with growing pauses
   * once it is not getting there.
   */
  private catchUp(failed: boolean): void {
    if (this.stopped || this.refetchTimer) return;
    if (!this.isBehind()) {
      this.catchUpMisses = 0;
      return;
    }
    const delay =
      failed || this.catchUpMisses > 0
        ? Math.min(1000 * 2 ** this.catchUpMisses, CATCH_UP_MAX_MS)
        : REFETCH_DELAY_MS;
    this.catchUpMisses += 1;
    this.scheduleRefetch(delay, true);
  }

  /**
   * Show a snapshot unless it is older than the shown one: a write may have
   * landed while a GET travelled.
   */
  private accept(data: EventSnapshotData, etag: string | null): void {
    if (data.event.version < this.shownVersion()) return;
    this.etag = etag;
    this.set({ status: 'ready', data, stale: false });
  }

  /** Take a snapshot a write returned, if it is newer than what we show. */
  apply(data: EventSnapshotData): void {
    this.accept(data, snapshotEtag(data.event.version));
  }

  /** The event was deleted by this browser. */
  markDeleted(): void {
    this.stop();
    this.set({ status: 'deleted' });
  }

  private openStream(): void {
    if (typeof EventSource === 'undefined') {
      this.startPolling();
      return;
    }
    const source = new EventSource(streamUrl(this.id));
    this.source = source;
    source.addEventListener('changed', (message) => {
      const version = parseVersion((message as MessageEvent<string>).data);
      if (version === null) return;
      this.announced = Math.max(this.announced, version);
      if (version > this.shownVersion()) {
        // A fresh announcement overrides a long catch-up pause.
        if (this.refetchIsCatchUp) this.cancelRefetch();
        this.scheduleRefetch();
      }
    });
    source.addEventListener('deleted', () => {
      this.markDeleted();
    });
    // Per stream, so a new `EventSource` starts afresh: a stream that has been
    // open and drops reconnects by itself, however many attempts that takes,
    // and is only given up on when it stays CONNECTING too long.
    let connectErrors = 0;
    let opened = false;
    source.addEventListener('open', () => {
      opened = true;
      connectErrors = 0;
      this.clearOpenTimer();
    });
    // A request that never completes (blocked, aborted, a proxy that swallows
    // it) leaves the source CONNECTING for good and never reports CLOSED.
    this.armOpenTimer(source);
    source.addEventListener('error', () => {
      if (this.stopped || this.source !== source) return;
      // EventSource reconnects by itself after a dropped connection. Only a
      // refusal (429, 404, a proxy's 502 during a deploy) closes it for good;
      // then poll instead, and try the stream again after a while. Errors in
      // a row without ever opening mean the stream is not coming; after an
      // open they are the browser reconnecting, which gets STREAM_OPEN_MS.
      if (source.readyState === CONNECTING) {
        if (!opened) connectErrors += 1;
        else if (this.openTimer === null) this.armOpenTimer(source);
      }
      if (
        source.readyState === EventSource.CLOSED ||
        (!opened && connectErrors >= STREAM_CONNECT_ERRORS)
      ) {
        this.giveUpStream(source);
      }
    });
  }

  /** Give up on `source` if it is still CONNECTING after STREAM_OPEN_MS. */
  private armOpenTimer(source: EventSource): void {
    this.clearOpenTimer();
    this.openTimer = setTimeout(() => {
      this.openTimer = null;
      if (this.source === source && source.readyState === CONNECTING) {
        this.giveUpStream(source);
      }
    }, STREAM_OPEN_MS);
  }

  private clearOpenTimer(): void {
    if (this.openTimer) clearTimeout(this.openTimer);
    this.openTimer = null;
  }

  /** Poll instead of the stream, and try the stream again after a while. */
  private giveUpStream(source: EventSource): void {
    this.clearOpenTimer();
    source.close();
    this.source = null;
    this.startPolling();
    this.streamRetryTimer ??= setTimeout(() => {
      this.streamRetryTimer = null;
      if (this.stopped) return;
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = null;
      void this.refresh();
      this.openStream();
    }, STREAM_RETRY_MS);
  }

  private scheduleRefetch(
    delay: number = REFETCH_DELAY_MS,
    onlyIfBehind = false
  ): void {
    if (this.refetchTimer) return;
    this.refetchIsCatchUp = onlyIfBehind;
    this.refetchTimer = setTimeout(() => {
      this.refetchTimer = null;
      this.refetchIsCatchUp = false;
      // A write may have caught up while a catch-up was waiting.
      if (onlyIfBehind && !this.isBehind()) {
        this.catchUpMisses = 0;
        return;
      }
      void this.refresh();
    }, delay);
  }

  private cancelRefetch(): void {
    if (this.refetchTimer) clearTimeout(this.refetchTimer);
    this.refetchTimer = null;
    this.refetchIsCatchUp = false;
  }

  /**
   * A phone that slept or changed networks loses its connection without the
   * stream noticing, so the view would stay as it was. Coming back to the
   * page, or back online, asks for the event again.
   */
  private listenForReturn(): void {
    if (this.unlisten || typeof window === 'undefined') return;
    const check = (): void => {
      if (this.stopped) return;
      void this.refresh();
      // A stream that died silently never says so; a new one starts with the
      // current version, and the catch-up logic does the rest.
      if (this.source) {
        this.source.close();
        this.source = null;
        this.openStream();
      }
    };
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') check();
    };
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', onVisible);
    this.unlisten = () => {
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }

  private startPolling(): void {
    if (this.pollTimer || this.stopped) return;
    this.pollTimer = setInterval(() => void this.refresh(), POLL_MS);
  }
}

function parseVersion(data: string): number | null {
  try {
    const value: unknown = JSON.parse(data);
    if (typeof value === 'object' && value !== null && 'version' in value) {
      const version = (value as { version: unknown }).version;
      return typeof version === 'number' ? version : null;
    }
  } catch {
    // A malformed message is ignored; the next one will do.
  }
  return null;
}
