import type { EventSnapshotData } from '@owl/shared';
import { api, ApiFailure, streamUrl } from './api.ts';

export type EventState =
  | { status: 'loading' }
  | { status: 'ready'; data: EventSnapshotData; stale: boolean }
  | { status: 'not-found' }
  | { status: 'deleted' }
  | { status: 'error'; error: unknown };

/** How long to wait after a "changed" before fetching — changes come in bursts. */
const REFETCH_DELAY_MS = 400;
/** How often to poll when the live stream is refused or unavailable. */
const POLL_MS = 30_000;
/** How long to poll before trying the live stream again. */
const STREAM_RETRY_MS = 5 * 60_000;
/** The longest pause between attempts to catch up with an announced version. */
const CATCH_UP_MAX_MS = 30_000;

/**
 * One event as the client knows it: the latest snapshot, kept fresh by the
 * server's live stream.
 *
 * The stream only says "changed to version n". The store then fetches the
 * snapshot with the ETag it has, so a change this browser made itself — whose
 * response it has already applied — costs a 304 and nothing more.
 */
export class EventStore {
  private state: EventState = { status: 'loading' };
  private etag: string | null = null;
  private readonly listeners = new Set<() => void>();
  private source: EventSource | null = null;
  private refetchTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private streamRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private fetching: Promise<void> | null = null;
  private stopped = false;
  private unlisten: (() => void) | null = null;
  /** The newest version the stream has announced, -1 before any. */
  private announced = -1;
  /** Catch-up fetches in a row that did not reach the announced version. */
  private catchUpMisses = 0;
  readonly id: string;

  constructor(id: string) {
    this.id = id;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): EventState => this.state;

  private set(state: EventState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
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
    if (this.refetchTimer) clearTimeout(this.refetchTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.streamRetryTimer) clearTimeout(this.streamRetryTimer);
    this.refetchTimer = null;
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
      // A write may have applied a newer snapshot while this GET travelled.
      if (
        this.state.status === 'ready' &&
        result.data.event.version < this.state.data.event.version
      )
        return false;
      this.etag = result.etag;
      this.set({ status: 'ready', data: result.data, stale: false });
      return false;
    } catch (error) {
      if (this.stopped) return false;
      if (error instanceof ApiFailure && error.status === 404) {
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
        this.set({ status: 'error', error });
      }
      return true;
    }
  }

  private shownVersion(): number {
    return this.state.status === 'ready' ? this.state.data.event.version : -1;
  }

  /**
   * An announcement is said once. When the fetch it set off failed, or ran
   * into a request that was already under way and brought an older snapshot
   * home, nothing would ask again: so while the store is behind the newest
   * version heard of, it keeps asking, with growing pauses once it is not
   * getting there.
   */
  private catchUp(failed: boolean): void {
    if (this.stopped || this.refetchTimer) return;
    if (this.announced <= this.shownVersion()) {
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

  /** Take a snapshot a write returned, if it is newer than what we show. */
  apply(data: EventSnapshotData): void {
    const current =
      this.state.status === 'ready' ? this.state.data.event.version : -1;
    if (data.event.version < current) return;
    this.etag = `"v${data.event.version}"`;
    this.set({ status: 'ready', data, stale: false });
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
      if (version > this.shownVersion()) this.scheduleRefetch();
    });
    source.addEventListener('deleted', () => {
      this.markDeleted();
    });
    source.addEventListener('error', () => {
      // EventSource reconnects by itself after a dropped connection. Only a
      // refusal (429, 404, a proxy's 502 during a deploy) closes it for good;
      // then poll instead, and try the stream again after a while.
      if (source.readyState === EventSource.CLOSED && !this.stopped) {
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
    });
  }

  private scheduleRefetch(
    delay: number = REFETCH_DELAY_MS,
    onlyIfBehind = false
  ): void {
    if (this.refetchTimer) return;
    this.refetchTimer = setTimeout(() => {
      this.refetchTimer = null;
      // A write may have caught up while a catch-up was waiting.
      if (onlyIfBehind && this.announced <= this.shownVersion()) return;
      void this.refresh();
    }, delay);
  }

  /**
   * A phone that slept or changed networks loses its connection without the
   * stream noticing, so the view would stay as it was. Coming back to the
   * page, or back online, asks for the event again.
   */
  private listenForReturn(): void {
    if (this.unlisten || typeof window === 'undefined') return;
    const check = (): void => {
      if (!this.stopped) void this.refresh();
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
