import { snapshotEtag } from '@owl/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventStore } from '../src/lib/eventStore.ts';
import {
  EVENT_ID,
  eventSnapshot,
  FakeEventSource,
  installBrowser,
  jsonResponse,
} from './browser.ts';

let responses: (Response | Error)[];
let requests: RequestInit[];

beforeEach(() => {
  vi.useFakeTimers();
  FakeEventSource.instances = [];
  responses = [];
  requests = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      requests.push(init);
      const next = responses.shift() ?? jsonResponse(304, null);
      if (next instanceof Error) throw next;
      return next;
    })
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
};

describe('EventStore', () => {
  it('loads the event and tells subscribers', async () => {
    responses.push(jsonResponse(200, eventSnapshot(1), { etag: '"v1"' }));
    const store = new EventStore(EVENT_ID);
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getState().status));
    store.start();
    expect(store.getState().status).toBe('loading');
    await flush();
    expect(store.getState()).toMatchObject({ status: 'ready', stale: false });
    expect(seen).toEqual(['ready']);
    store.stop();
  });

  it('refetches after a newer version is announced, and only then', async () => {
    responses.push(jsonResponse(200, eventSnapshot(1), { etag: '"v1"' }));
    const store = new EventStore(EVENT_ID);
    store.start();
    await flush();
    const source = FakeEventSource.instances[0]!;
    source.emit('changed', '{"version":1}');
    await vi.advanceTimersByTimeAsync(1000);
    expect(requests).toHaveLength(1);
    responses.push(jsonResponse(200, eventSnapshot(2), { etag: '"v2"' }));
    source.emit('changed', '{"version":2}');
    source.emit('changed', '{"version":2}');
    source.emit('changed', 'not json');
    await vi.advanceTimersByTimeAsync(1000);
    expect(requests).toHaveLength(2);
    expect(
      (requests[1]!.headers as Record<string, string>)['if-none-match']
    ).toBe('"v1"');
    const state = store.getState();
    expect(state.status === 'ready' && state.data.event.version).toBe(2);
    store.stop();
    expect(source.closed).toBe(true);
  });

  it('applies a newer snapshot from a write and ignores an older one', async () => {
    responses.push(jsonResponse(200, eventSnapshot(3), { etag: '"v3"' }));
    const store = new EventStore(EVENT_ID);
    store.start();
    await flush();
    store.apply(eventSnapshot(2));
    expect(
      store.getState().status === 'ready' &&
        (store.getState() as { data: { event: { version: number } } }).data
          .event.version
    ).toBe(3);
    store.apply(eventSnapshot(4));
    expect(
      (store.getState() as { data: { event: { version: number } } }).data.event
        .version
    ).toBe(4);
    store.stop();
  });

  it('says not found for an unknown event, and deleted for one that goes away', async () => {
    responses.push(jsonResponse(404, { error: 'not_found' }));
    const missing = new EventStore(EVENT_ID);
    missing.start();
    await flush();
    expect(missing.getState().status).toBe('not-found');

    responses.push(jsonResponse(200, eventSnapshot(1)));
    const store = new EventStore(EVENT_ID);
    store.start();
    await flush();
    FakeEventSource.instances.at(-1)!.emit('deleted');
    expect(store.getState().status).toBe('deleted');
  });

  it('keeps the last state but marks it stale when a refetch fails, and recovers', async () => {
    responses.push(jsonResponse(200, eventSnapshot(1), { etag: '"v1"' }));
    const store = new EventStore(EVENT_ID);
    store.start();
    await flush();
    responses.push(new TypeError('offline'));
    await store.refresh();
    expect(store.getState()).toMatchObject({ status: 'ready', stale: true });
    responses.push(jsonResponse(304, null));
    await store.refresh();
    expect(store.getState()).toMatchObject({ status: 'ready', stale: false });
    store.stop();
  });

  it('reports an error when the first load fails', async () => {
    responses.push(new TypeError('offline'));
    const store = new EventStore(EVENT_ID);
    store.start();
    await flush();
    expect(store.getState()).toEqual({ status: 'error' });
    store.stop();
  });

  it('falls back to polling when the stream is refused', async () => {
    responses.push(jsonResponse(200, eventSnapshot(1), { etag: '"v1"' }));
    const store = new EventStore(EVENT_ID);
    store.start();
    await flush();
    const source = FakeEventSource.instances[0]!;
    source.readyState = FakeEventSource.CLOSED;
    source.emit('error');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(requests).toHaveLength(2);
    store.stop();
  });

  it('tries the stream again after polling for a while, and polls no more once it is back', async () => {
    responses.push(jsonResponse(200, eventSnapshot(1), { etag: '"v1"' }));
    const store = new EventStore(EVENT_ID);
    store.start();
    await flush();
    const first = FakeEventSource.instances[0]!;
    first.readyState = FakeEventSource.CLOSED;
    first.emit('error');
    // A second error from the same closed source does not stack timers.
    first.emit('error');
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(FakeEventSource.instances).toHaveLength(2);
    const polled = requests.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(requests).toHaveLength(polled);
    store.stop();
  });

  it('does not retry the stream after stop', async () => {
    responses.push(jsonResponse(200, eventSnapshot(1), { etag: '"v1"' }));
    const store = new EventStore(EVENT_ID);
    store.start();
    await flush();
    const source = FakeEventSource.instances[0]!;
    source.readyState = FakeEventSource.CLOSED;
    source.emit('error');
    store.stop();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('keeps a newer snapshot when an older GET lands after it', async () => {
    let answer: (response: Response) => void = () => undefined;
    responses.push(jsonResponse(200, eventSnapshot(1), { etag: '"v1"' }));
    const store = new EventStore(EVENT_ID);
    store.start();
    await flush();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            answer = resolve;
          })
      )
    );
    const refreshing = store.refresh();
    // A write answers with version 3 while the GET is still travelling.
    store.apply(eventSnapshot(3));
    answer(jsonResponse(200, eventSnapshot(2), { etag: '"v2"' }));
    await refreshing;
    const state = store.getState();
    expect(state.status === 'ready' && state.data.event.version).toBe(3);
    store.stop();
  });

  it('polls where there is no EventSource at all', async () => {
    vi.stubGlobal('EventSource', undefined);
    responses.push(jsonResponse(200, eventSnapshot(1)));
    const store = new EventStore(EVENT_ID);
    store.start();
    await flush();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(requests).toHaveLength(2);
    store.stop();
  });

  it('shares one fetch between overlapping refreshes and ignores answers after stop', async () => {
    responses.push(jsonResponse(200, eventSnapshot(1)));
    const store = new EventStore(EVENT_ID);
    const first = store.refresh();
    const second = store.refresh();
    expect(first).toBe(second);
    store.stop();
    await first;
    expect(store.getState().status).toBe('loading');
  });

  describe('announcements that must not be lost', () => {
    const version = (store: EventStore) => {
      const state = store.getState();
      return state.status === 'ready' ? state.data.event.version : null;
    };

    /** A fetch whose answers the test hands out, oldest request first. */
    function heldFetch() {
      const held: ((response: Response | Error) => void)[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init: RequestInit) =>
            new Promise<Response>((resolve, reject) => {
              requests.push(init);
              held.push((answer) =>
                answer instanceof Error ? reject(answer) : resolve(answer)
              );
            })
        )
      );
      return held;
    }

    async function startAt(first: number) {
      responses.push(
        jsonResponse(200, eventSnapshot(first), { etag: `"v${first}"` })
      );
      const store = new EventStore(EVENT_ID);
      store.start();
      await flush();
      return store;
    }

    it('asks again when the fetch it set off ran into one under way and got an older snapshot', async () => {
      const store = await startAt(1);
      const held = heldFetch();
      const running = store.refresh(); // e.g. after one's own save
      FakeEventSource.instances[0]!.emit('changed', '{"version":3}');
      await vi.advanceTimersByTimeAsync(400); // the timer's refresh merges
      expect(requests).toHaveLength(2);
      held[0]!(jsonResponse(200, eventSnapshot(2), { etag: '"v2"' }));
      await running;
      expect(version(store)).toBe(2);
      await vi.advanceTimersByTimeAsync(400);
      expect(held).toHaveLength(2);
      held[1]!(jsonResponse(200, eventSnapshot(3), { etag: '"v3"' }));
      await vi.advanceTimersByTimeAsync(0);
      expect(version(store)).toBe(3);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(held).toHaveLength(2);
      store.stop();
    });

    it('retries a failed fetch with the stream still open, and clears the stale flag', async () => {
      const store = await startAt(1);
      responses.push(jsonResponse(502, { error: 'bad_gateway' }));
      FakeEventSource.instances[0]!.emit('changed', '{"version":2}');
      await vi.advanceTimersByTimeAsync(400);
      expect(store.getState()).toMatchObject({ status: 'ready', stale: true });
      expect(requests).toHaveLength(2);
      responses.push(jsonResponse(200, eventSnapshot(2), { etag: '"v2"' }));
      await vi.advanceTimersByTimeAsync(1000);
      expect(requests).toHaveLength(3);
      expect(store.getState()).toMatchObject({ status: 'ready', stale: false });
      expect(version(store)).toBe(2);
      store.stop();
    });

    it('backs off while the announced version does not turn up, up to a cap', async () => {
      const store = await startAt(1);
      FakeEventSource.instances[0]!.emit('changed', '{"version":5}');
      // Every answer is "not modified": the server never gets to version 5.
      await vi.advanceTimersByTimeAsync(400);
      expect(requests).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(400); // one quick catch-up
      expect(requests).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(1999);
      expect(requests).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(4);
      await vi.advanceTimersByTimeAsync(4000);
      expect(requests).toHaveLength(5);
      const before = requests.length;
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      // Past the cap: one request per 30 seconds at the most.
      expect(requests.length - before).toBeLessThanOrEqual(21);
      expect(requests.length - before).toBeGreaterThanOrEqual(15);
      store.stop();
    });

    it('does not ask again for the version it already shows, or an older one', async () => {
      const store = await startAt(2);
      const source = FakeEventSource.instances[0]!;
      source.emit('changed', '{"version":2}');
      source.emit('changed', '{"version":1}');
      source.emit('changed', '{"version":0}');
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(requests).toHaveLength(1);
      store.stop();
    });

    it('forgets a missed announcement once a write brings the version in', async () => {
      const store = await startAt(1);
      responses.push(new TypeError('offline'));
      FakeEventSource.instances[0]!.emit('changed', '{"version":2}');
      await vi.advanceTimersByTimeAsync(400);
      store.apply(eventSnapshot(2));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(requests).toHaveLength(2);
      store.stop();
    });

    it('stops chasing when the store is stopped, and not when the event is gone', async () => {
      const store = await startAt(1);
      responses.push(new TypeError('offline'));
      FakeEventSource.instances[0]!.emit('changed', '{"version":2}');
      await vi.advanceTimersByTimeAsync(400);
      store.stop();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(requests).toHaveLength(2);

      const gone = await startAt(1);
      responses.push(jsonResponse(404, { error: 'not_found' }));
      FakeEventSource.instances.at(-1)!.emit('changed', '{"version":2}');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(gone.getState().status).toBe('deleted');
      expect(requests).toHaveLength(4);
    });

    it('chases an announcement the first load missed, too', async () => {
      responses.push(new TypeError('offline'));
      const store = new EventStore(EVENT_ID);
      store.start();
      await flush();
      expect(store.getState().status).toBe('error');
      FakeEventSource.instances[0]!.emit('changed', '{"version":4}');
      responses.push(jsonResponse(200, eventSnapshot(4), { etag: '"v4"' }));
      await vi.advanceTimersByTimeAsync(400);
      expect(version(store)).toBe(4);
      store.stop();
    });
  });

  describe('which snapshot is shown', () => {
    const ifNoneMatch = (index: number) =>
      (requests[index]!.headers as Record<string, string> | undefined)?.[
        'if-none-match'
      ];

    async function startedAt(version: number) {
      responses.push(
        jsonResponse(200, eventSnapshot(version), {
          etag: snapshotEtag(version),
        })
      );
      const store = new EventStore(EVENT_ID);
      store.start();
      await flush();
      return store;
    }

    it('ignores an older snapshot on both paths, and keeps the ETag of the newer one', async () => {
      const store = await startedAt(3);
      const shown = store.getState();
      let notified = 0;
      store.subscribe(() => (notified += 1));
      store.apply(eventSnapshot(2));
      responses.push(
        jsonResponse(200, eventSnapshot(2), { etag: snapshotEtag(2) })
      );
      await store.refresh();
      expect(store.getState()).toBe(shown);
      expect(notified).toBe(0);
      responses.push(jsonResponse(304, null));
      await store.refresh();
      expect(ifNoneMatch(2)).toBe(snapshotEtag(3));
      store.stop();
    });

    it('takes a snapshot of the very version it shows, on both paths', async () => {
      const store = await startedAt(3);
      const shown = store.getState();
      let notified = 0;
      store.subscribe(() => (notified += 1));
      store.apply(eventSnapshot(3));
      const applied = store.getState();
      expect(applied).not.toBe(shown);
      expect(applied).toMatchObject({ status: 'ready', stale: false });
      responses.push(
        jsonResponse(200, eventSnapshot(3), { etag: snapshotEtag(3) })
      );
      await store.refresh();
      expect(store.getState()).not.toBe(applied);
      expect(notified).toBe(2);
      store.stop();
    });

    it('takes the first snapshot on both paths, version 0 included', async () => {
      const written = new EventStore(EVENT_ID);
      written.apply(eventSnapshot(0));
      expect(written.getState()).toMatchObject({ status: 'ready' });
      responses.push(jsonResponse(304, null));
      await written.refresh();
      expect(ifNoneMatch(0)).toBe(snapshotEtag(0));

      const loaded = await startedAt(0);
      expect(loaded.getState()).toMatchObject({ status: 'ready' });
      written.stop();
      loaded.stop();
    });

    it('sends the ETag of an own write next, and a 304 leaves the state untouched', async () => {
      const store = await startedAt(1);
      store.apply(eventSnapshot(2));
      const written = store.getState();
      responses.push(jsonResponse(304, null));
      await store.refresh();
      expect(ifNoneMatch(1)).toBe(snapshotEtag(2));
      expect(store.getState()).toBe(written);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(requests).toHaveLength(2);
      store.stop();
    });

    it('sends the ETag the server gave as it gave it, and none when it gave none', async () => {
      responses.push(
        jsonResponse(200, eventSnapshot(1), { etag: 'W/"other"' })
      );
      const store = new EventStore(EVENT_ID);
      store.start();
      await flush();
      responses.push(jsonResponse(200, eventSnapshot(2)));
      await store.refresh();
      expect(ifNoneMatch(1)).toBe('W/"other"');
      await store.refresh();
      expect(ifNoneMatch(2)).toBeUndefined();
      store.stop();
    });
  });

  describe('a failed refresh nobody announced', () => {
    const isStale = (store: EventStore) => {
      const state = store.getState();
      return state.status === 'ready' && state.stale;
    };

    async function started() {
      responses.push(jsonResponse(200, eventSnapshot(1), { etag: '"v1"' }));
      const store = new EventStore(EVENT_ID);
      store.start();
      await flush();
      return store;
    }

    it('is retried after a second, and the stale flag clears on success', async () => {
      const store = await started();
      responses.push(new TypeError('offline'));
      await store.refresh();
      expect(isStale(store)).toBe(true);
      expect(requests).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(999);
      expect(requests).toHaveLength(2);
      responses.push(jsonResponse(304, null));
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(3);
      expect(isStale(store)).toBe(false);
      // Up to date again: nothing more is asked.
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(requests).toHaveLength(3);
      store.stop();
    });

    it('is retried by a reconnect greeting that names the version already shown', async () => {
      const store = await started();
      responses.push(new TypeError('offline'));
      await store.refresh();
      FakeEventSource.instances[0]!.emit('changed', '{"version":1}');
      await vi.advanceTimersByTimeAsync(1000);
      expect(requests).toHaveLength(3);
      expect(isStale(store)).toBe(false);
      store.stop();
    });

    it('backs off from one second to thirty and starts over after a success', async () => {
      const store = await started();
      // The refresh and seven retries fail; the next retry gets a 304.
      for (let i = 0; i < 8; i += 1) responses.push(new TypeError('offline'));
      await store.refresh();
      let expected = 2;
      for (const gap of [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]) {
        await vi.advanceTimersByTimeAsync(gap - 1);
        expect(requests).toHaveLength(expected);
        await vi.advanceTimersByTimeAsync(1);
        expected += 1;
        expect(requests).toHaveLength(expected);
        expect(isStale(store)).toBe(true);
      }
      await vi.advanceTimersByTimeAsync(30_000);
      expect(requests).toHaveLength(expected + 1);
      expect(isStale(store)).toBe(false);

      responses.push(new TypeError('offline'));
      await store.refresh();
      expect(requests).toHaveLength(expected + 2);
      await vi.advanceTimersByTimeAsync(999);
      expect(requests).toHaveLength(expected + 2);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(expected + 3);
      expect(isStale(store)).toBe(false);
      store.stop();
    });

    it('does not stack a second retry while one is waiting', async () => {
      const store = await started();
      responses.push(new TypeError('offline'), new TypeError('offline'));
      await store.refresh();
      await store.refresh();
      expect(requests).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(1000);
      expect(requests).toHaveLength(4);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(requests).toHaveLength(4);
      store.stop();
    });

    it('is not retried once a refresh or a write has brought the store up to date', async () => {
      const store = await started();
      responses.push(new TypeError('offline'));
      await store.refresh();
      responses.push(jsonResponse(304, null));
      await store.refresh();
      expect(isStale(store)).toBe(false);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(requests).toHaveLength(3);

      responses.push(new TypeError('offline'));
      await store.refresh();
      expect(isStale(store)).toBe(true);
      store.apply(eventSnapshot(2));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(requests).toHaveLength(4);
      store.stop();
    });

    it('is not retried after stop, whether the retry is waiting or under way', async () => {
      const waiting = await started();
      responses.push(new TypeError('offline'));
      await waiting.refresh();
      waiting.stop();
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(requests).toHaveLength(2);

      const store = await started();
      responses.push(new TypeError('offline'));
      await store.refresh();
      let fail: (error: Error) => void = () => undefined;
      const held = vi.fn(
        () =>
          new Promise<Response>((_resolve, reject) => {
            fail = reject;
          })
      );
      vi.stubGlobal('fetch', held);
      await vi.advanceTimersByTimeAsync(1000);
      expect(held).toHaveBeenCalledTimes(1);
      store.stop();
      fail(new TypeError('offline'));
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(held).toHaveBeenCalledTimes(1);
    });

    it('is not retried once the event turns out to be gone', async () => {
      const store = await started();
      responses.push(new TypeError('offline'));
      await store.refresh();
      responses.push(jsonResponse(404, { error: 'not_found' }));
      await vi.advanceTimersByTimeAsync(1000);
      expect(store.getState().status).toBe('deleted');
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(requests).toHaveLength(3);
    });

    it('asks nothing while the store is ready and not stale', async () => {
      const store = await started();
      responses.push(jsonResponse(304, null));
      await store.refresh();
      expect(requests).toHaveLength(2);
      expect(
        (requests[1]!.headers as Record<string, string>)['if-none-match']
      ).toBe('"v1"');
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(requests).toHaveLength(2);
      store.stop();
    });

    it('leaves a failed first load to the stream', async () => {
      responses.push(new TypeError('offline'));
      const store = new EventStore(EVENT_ID);
      store.start();
      await flush();
      expect(store.getState().status).toBe('error');
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(requests).toHaveLength(1);
      // The stream's greeting names the current version and heals it.
      responses.push(jsonResponse(200, eventSnapshot(1), { etag: '"v1"' }));
      FakeEventSource.instances[0]!.emit('changed', '{"version":1}');
      await vi.advanceTimersByTimeAsync(400);
      expect(store.getState()).toMatchObject({ status: 'ready', stale: false });
      store.stop();
    });
  });

  describe('coming back to the page', () => {
    let browser: ReturnType<typeof installBrowser>;
    beforeEach(() => {
      browser = installBrowser();
    });

    async function started() {
      responses.push(jsonResponse(200, eventSnapshot(1), { etag: '"v1"' }));
      const store = new EventStore(EVENT_ID);
      store.start();
      await flush();
      return store;
    }

    it('fetches again when the page becomes visible, and not when it is hidden', async () => {
      const store = await started();
      expect(requests).toHaveLength(1);
      browser.document.visibilityState = 'hidden';
      browser.document.dispatch('visibilitychange');
      await flush();
      expect(requests).toHaveLength(1);
      browser.document.visibilityState = 'visible';
      browser.document.dispatch('visibilitychange');
      await flush();
      expect(requests).toHaveLength(2);
      store.stop();
    });

    it('retries a fetch that failed on waking up, though no change was announced', async () => {
      const store = await started();
      responses.push(new TypeError('radio not up yet'));
      browser.document.dispatch('visibilitychange');
      await flush();
      expect(requests).toHaveLength(2);
      expect(store.getState()).toMatchObject({ status: 'ready', stale: true });
      await vi.advanceTimersByTimeAsync(1000);
      expect(requests).toHaveLength(3);
      expect(store.getState()).toMatchObject({ status: 'ready', stale: false });
      store.stop();
    });

    it('fetches again when the network comes back', async () => {
      const store = await started();
      browser.window.dispatch('online');
      await flush();
      expect(requests).toHaveLength(2);
      store.stop();
    });

    it('shares one fetch between two signals at once', async () => {
      const store = await started();
      browser.window.dispatch('online');
      browser.document.dispatch('visibilitychange');
      await flush();
      expect(requests).toHaveLength(2);
      store.stop();
    });

    it('stops listening with the store, and does not stack listeners over restarts', async () => {
      const store = await started();
      store.stop();
      store.start();
      store.stop();
      store.start();
      await flush();
      expect(browser.window.listenerCount('online')).toBe(1);
      expect(browser.document.listenerCount('visibilitychange')).toBe(1);
      const before = requests.length;
      browser.window.dispatch('online');
      await flush();
      expect(requests).toHaveLength(before + 1);
      store.stop();
      expect(browser.window.listenerCount('online')).toBe(0);
      expect(browser.document.listenerCount('visibilitychange')).toBe(0);
      browser.window.dispatch('online');
      browser.document.dispatch('visibilitychange');
      await flush();
      expect(requests).toHaveLength(before + 1);
    });

    it('stops listening once the event turns out to be gone', async () => {
      const store = await started();
      responses.push(jsonResponse(404, { error: 'not_found' }));
      await store.refresh();
      expect(store.getState().status).toBe('deleted');
      expect(browser.window.listenerCount('online')).toBe(0);
    });
  });
});
