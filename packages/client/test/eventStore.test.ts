import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventStore } from '../src/lib/eventStore.ts';
import { FakeEventSource, jsonResponse } from './browser.ts';

const ID = '7gT4kPq2Wx9Z';

const snapshot = (version: number) => ({
  event: {
    id: ID,
    title: 'T',
    description: null,
    location: null,
    emoji: 'owl',
    creatorName: null,
    language: 'en',
    durationDays: 1,
    minCount: null,
    status: 'open',
    finalStart: null,
    finalEnd: null,
    createdAt: 1,
    expiresOn: '2027-05-30',
    version,
    days: ['2027-03-06'],
  },
  participants: [],
});

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
    responses.push(jsonResponse(200, snapshot(1), { etag: '"v1"' }));
    const store = new EventStore(ID);
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
    responses.push(jsonResponse(200, snapshot(1), { etag: '"v1"' }));
    const store = new EventStore(ID);
    store.start();
    await flush();
    const source = FakeEventSource.instances[0]!;
    source.emit('changed', '{"version":1}');
    await vi.advanceTimersByTimeAsync(1000);
    expect(requests).toHaveLength(1);
    responses.push(jsonResponse(200, snapshot(2), { etag: '"v2"' }));
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
    responses.push(jsonResponse(200, snapshot(3), { etag: '"v3"' }));
    const store = new EventStore(ID);
    store.start();
    await flush();
    store.apply(snapshot(2) as never);
    expect(
      store.getState().status === 'ready' &&
        (store.getState() as { data: { event: { version: number } } }).data
          .event.version
    ).toBe(3);
    store.apply(snapshot(4) as never);
    expect(
      (store.getState() as { data: { event: { version: number } } }).data.event
        .version
    ).toBe(4);
    store.stop();
  });

  it('says not found for an unknown event, and deleted for one that goes away', async () => {
    responses.push(jsonResponse(404, { error: 'not_found' }));
    const missing = new EventStore(ID);
    missing.start();
    await flush();
    expect(missing.getState().status).toBe('not-found');

    responses.push(jsonResponse(200, snapshot(1)));
    const store = new EventStore(ID);
    store.start();
    await flush();
    FakeEventSource.instances.at(-1)!.emit('deleted');
    expect(store.getState().status).toBe('deleted');
  });

  it('keeps the last state but marks it stale when a refetch fails, and recovers', async () => {
    responses.push(jsonResponse(200, snapshot(1), { etag: '"v1"' }));
    const store = new EventStore(ID);
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
    const store = new EventStore(ID);
    store.start();
    await flush();
    expect(store.getState().status).toBe('error');
    store.stop();
  });

  it('falls back to polling when the stream is refused', async () => {
    responses.push(jsonResponse(200, snapshot(1), { etag: '"v1"' }));
    const store = new EventStore(ID);
    store.start();
    await flush();
    const source = FakeEventSource.instances[0]!;
    source.readyState = FakeEventSource.CLOSED;
    source.emit('error');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(requests).toHaveLength(2);
    store.stop();
  });

  it('polls where there is no EventSource at all', async () => {
    vi.stubGlobal('EventSource', undefined);
    responses.push(jsonResponse(200, snapshot(1)));
    const store = new EventStore(ID);
    store.start();
    await flush();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(requests).toHaveLength(2);
    store.stop();
  });

  it('shares one fetch between overlapping refreshes and ignores answers after stop', async () => {
    responses.push(jsonResponse(200, snapshot(1)));
    const store = new EventStore(ID);
    const first = store.refresh();
    const second = store.refresh();
    expect(first).toBe(second);
    store.stop();
    await first;
    expect(store.getState().status).toBe('loading');
  });
});
