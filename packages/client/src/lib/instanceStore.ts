import type { InstanceInfoData } from '@owl/shared';

export type InstanceState =
  | { status: 'loading'; info: null }
  | { status: 'ready'; info: InstanceInfoData }
  | { status: 'failed'; info: InstanceInfoData | null };

/** The initial state, before the first answer. */
export const INSTANCE_LOADING: InstanceState = {
  status: 'loading',
  info: null,
};

/**
 * What a page that depends on the instance's statements should tell the
 * reader: that they are on their way, that they could not be had, or nothing.
 * Data loaded once stands even when a later fetch failed.
 */
export function instanceNotice(
  state: InstanceState
): 'loaded' | 'loading' | 'failed' {
  if (state.info) return 'loaded';
  return state.status === 'failed' ? 'failed' : 'loading';
}

/** Pauses between attempts after a failure, the last one repeating. */
export const INSTANCE_RETRY_MS = [2000, 5000, 15_000, 30_000];

/**
 * What the instance says about itself — operator, imprint, whether new events
 * may be created. Footer, privacy page and share links all rest on it, so one
 * failed request must not leave them without it for the whole visit: a failed
 * fetch is tried again, and what was loaded once is never dropped.
 */
export class InstanceStore {
  private state: InstanceState = INSTANCE_LOADING;
  private readonly listeners = new Set<() => void>();
  private readonly load: () => Promise<InstanceInfoData>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private running = false;
  private loading = false;

  constructor(load: () => Promise<InstanceInfoData>) {
    this.load = load;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): InstanceState => this.state;

  private set(state: InstanceState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  start(): void {
    this.running = true;
    if (this.state.status !== 'ready') void this.fetch();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Fetch now, unless one is under way. A failure keeps what was loaded. */
  async fetch(): Promise<void> {
    if (this.loading) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.loading = true;
    try {
      const info = await this.load();
      this.attempt = 0;
      if (this.running) this.set({ status: 'ready', info });
    } catch {
      if (!this.running) return;
      this.set({ status: 'failed', info: this.state.info });
      // Once loaded, the data stands; only a missing one is worth chasing.
      if (this.state.info === null) this.scheduleRetry();
    } finally {
      this.loading = false;
    }
  }

  private scheduleRetry(): void {
    const delay =
      INSTANCE_RETRY_MS[Math.min(this.attempt, INSTANCE_RETRY_MS.length - 1)]!;
    this.attempt += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.running) void this.fetch();
    }, delay);
  }
}
