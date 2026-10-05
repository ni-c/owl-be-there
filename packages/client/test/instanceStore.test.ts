import type { InstanceInfoData } from '@owl/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INSTANCE_LOADING,
  INSTANCE_RETRY_MS,
  InstanceStore,
  instanceNotice,
} from '../src/lib/instanceStore.ts';

const info = (creationEnabled = true): InstanceInfoData =>
  ({ creationEnabled, publicUrl: 'https://owl.example.org' }) as never;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A load function whose answers are handed out one by one. */
function loader(...answers: (InstanceInfoData | Error)[]) {
  const load = vi.fn(async () => {
    const next = answers.shift();
    if (next === undefined) throw new Error('no more answers');
    if (next instanceof Error) throw next;
    return next;
  });
  return load;
}

describe('InstanceStore', () => {
  it('starts out loading, then ready with the data', async () => {
    const store = new InstanceStore(loader(info()));
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getState().status));
    expect(store.getState()).toEqual({ status: 'loading', info: null });
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState()).toEqual({ status: 'ready', info: info() });
    expect(seen).toEqual(['ready']);
    store.stop();
  });

  it('tries again after a failed first request and becomes ready with the data', async () => {
    const load = loader(new TypeError('offline'), info(false));
    const store = new InstanceStore(load);
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState()).toEqual({ status: 'failed', info: null });
    await vi.advanceTimersByTimeAsync(INSTANCE_RETRY_MS[0]! - 1);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.getState()).toEqual({ status: 'ready', info: info(false) });
    // Done: nothing more is asked.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(load).toHaveBeenCalledTimes(2);
    store.stop();
  });

  it('waits longer after each failure, up to the last delay, which then repeats', async () => {
    const load = loader();
    const store = new InstanceStore(load);
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    let calls = 1;
    for (const delay of [...INSTANCE_RETRY_MS, INSTANCE_RETRY_MS.at(-1)!]) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(load).toHaveBeenCalledTimes(calls);
      await vi.advanceTimersByTimeAsync(1);
      calls += 1;
      expect(load).toHaveBeenCalledTimes(calls);
    }
    expect(store.getState().status).toBe('failed');
    store.stop();
  });

  it('keeps what was loaded when a later fetch fails, and chases nothing', async () => {
    const load = loader(info(), new TypeError('offline'), info(false));
    const store = new InstanceStore(load);
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    await store.fetch();
    expect(store.getState()).toEqual({ status: 'failed', info: info() });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(load).toHaveBeenCalledTimes(2);
    // A later success replaces it.
    await store.fetch();
    expect(store.getState()).toEqual({ status: 'ready', info: info(false) });
    store.stop();
  });

  it('runs one request at a time', async () => {
    let answer: (value: InstanceInfoData) => void = () => undefined;
    const load = vi.fn(
      () =>
        new Promise<InstanceInfoData>((resolve) => {
          answer = resolve;
        })
    );
    const store = new InstanceStore(load);
    store.start();
    void store.fetch();
    void store.fetch();
    expect(load).toHaveBeenCalledTimes(1);
    answer(info());
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().status).toBe('ready');
    store.stop();
  });

  it('does not ask again on start once it is ready', async () => {
    const load = loader(info());
    const store = new InstanceStore(load);
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    store.stop();
    store.start();
    expect(load).toHaveBeenCalledTimes(1);
    store.stop();
  });

  it('stops retrying when stopped, and ignores an answer that arrives after', async () => {
    const load = loader(new TypeError('offline'), info());
    const store = new InstanceStore(load);
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    store.stop();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(load).toHaveBeenCalledTimes(1);

    let answer: (value: InstanceInfoData) => void = () => undefined;
    const late = new InstanceStore(
      () =>
        new Promise<InstanceInfoData>((resolve) => {
          answer = resolve;
        })
    );
    late.start();
    late.stop();
    answer(info());
    await vi.advanceTimersByTimeAsync(0);
    expect(late.getState()).toEqual({ status: 'loading', info: null });
  });

  it('survives a StrictMode start, stop, start while the first request is under way', async () => {
    let answer: (value: InstanceInfoData) => void = () => undefined;
    const load = vi.fn(
      () =>
        new Promise<InstanceInfoData>((resolve) => {
          answer = resolve;
        })
    );
    const store = new InstanceStore(load);
    store.start();
    store.stop();
    store.start();
    answer(info());
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState()).toEqual({ status: 'ready', info: info() });
    store.stop();
  });

  it('stops listening for subscribers that unsubscribe', async () => {
    const store = new InstanceStore(loader(info()));
    const seen: string[] = [];
    const unsubscribe = store.subscribe(() => seen.push('x'));
    unsubscribe();
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual([]);
    store.stop();
  });
});

describe('instanceNotice', () => {
  it('tells loading before the first answer', () => {
    expect(instanceNotice(INSTANCE_LOADING)).toBe('loading');
  });

  it('tells failed when nothing was ever loaded', () => {
    expect(instanceNotice({ status: 'failed', info: null })).toBe('failed');
  });

  it('is loaded once the data is there, even if a later fetch failed', () => {
    expect(instanceNotice({ status: 'ready', info: info() })).toBe('loaded');
    expect(instanceNotice({ status: 'failed', info: info() })).toBe('loaded');
  });

  it('follows a store from loading through failed to loaded', async () => {
    const store = new InstanceStore(loader(new Error('offline'), info()));
    expect(instanceNotice(store.getState())).toBe('loading');
    store.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(instanceNotice(store.getState())).toBe('failed');
    await vi.advanceTimersByTimeAsync(INSTANCE_RETRY_MS[0]!);
    expect(instanceNotice(store.getState())).toBe('loaded');
    store.stop();
  });
});
