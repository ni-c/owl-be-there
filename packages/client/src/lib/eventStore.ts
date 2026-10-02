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
  private fetching: Promise<void> | null = null;
  private stopped = false;
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
  }

  stop(): void {
    this.stopped = true;
    this.source?.close();
    this.source = null;
    if (this.refetchTimer) clearTimeout(this.refetchTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.refetchTimer = null;
    this.pollTimer = null;
  }

  /** Fetch now, unless a fetch is already under way. */
  refresh(): Promise<void> {
    this.fetching ??= this.fetchOnce().finally(() => {
      this.fetching = null;
    });
    return this.fetching;
  }

  private async fetchOnce(): Promise<void> {
    try {
      const result = await api.getEvent(this.id, this.etag);
      if (this.stopped) return;
      if (result === null) {
        if (this.state.status === 'ready' && this.state.stale) {
          this.set({ ...this.state, stale: false });
        }
        return;
      }
      this.etag = result.etag;
      this.set({ status: 'ready', data: result.data, stale: false });
    } catch (error) {
      if (this.stopped) return;
      if (error instanceof ApiFailure && error.status === 404) {
        this.set(
          this.state.status === 'ready'
            ? { status: 'deleted' }
            : { status: 'not-found' }
        );
        this.stop();
      } else if (this.state.status === 'ready') {
        // Keep showing what we have; say it may be out of date.
        this.set({ ...this.state, stale: true });
      } else {
        this.set({ status: 'error', error });
      }
    }
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
      const current =
        this.state.status === 'ready' ? this.state.data.event.version : -1;
      if (version !== null && version > current) this.scheduleRefetch();
    });
    source.addEventListener('deleted', () => {
      this.markDeleted();
    });
    source.addEventListener('error', () => {
      // EventSource reconnects by itself after a dropped connection. Only a
      // refusal (429, 404) closes it for good; then poll instead.
      if (source.readyState === EventSource.CLOSED && !this.stopped) {
        this.source = null;
        this.startPolling();
      }
    });
  }

  private scheduleRefetch(): void {
    if (this.refetchTimer) return;
    this.refetchTimer = setTimeout(() => {
      this.refetchTimer = null;
      void this.refresh();
    }, REFETCH_DELAY_MS);
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
