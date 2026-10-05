import { joinMarks, type Marks } from '@owl/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PermanentSaveError,
  RETRY_DELAYS_MS,
  SaveQueue,
  type SaveRequest,
  type SaveStatus,
  type SendResult,
  type Timers,
} from '../src/lib/saveQueue.ts';
import { installBrowser } from './browser.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A send function whose answers the test hands out one by one. */
class FakeServer {
  rev = 0;
  marks = { yes: [] as string[], maybe: [] as string[] };
  readonly requests: SaveRequest[] = [];
  readonly keepalives: boolean[] = [];
  private readonly waiting: {
    request: SaveRequest;
    resolve(r: SendResult): void;
    reject(e: unknown): void;
  }[] = [];

  send = (request: SaveRequest, keepalive = false): Promise<SendResult> => {
    this.requests.push(request);
    this.keepalives.push(keepalive);
    return new Promise((resolve, reject) =>
      this.waiting.push({ request, resolve, reject })
    );
  };

  /** Answer the oldest open request the way the real server would. */
  answer(): void {
    const next = this.waiting.shift()!;
    if (next.request.baseRev !== this.rev) {
      next.resolve({ ok: false, rev: this.rev });
      return;
    }
    this.rev += 1;
    this.marks = { yes: next.request.yes, maybe: next.request.maybe };
    next.resolve({ ok: true, rev: this.rev });
  }

  fail(error: unknown): void {
    this.waiting.shift()!.reject(error);
  }

  get open(): number {
    return this.waiting.length;
  }
}

class FakeTimers implements Timers {
  readonly pending: { fn: () => void; ms: number }[] = [];
  setTimeout(fn: () => void, ms: number): unknown {
    const entry = { fn, ms };
    this.pending.push(entry);
    return entry;
  }
  clearTimeout(handle: unknown): void {
    const index = this.pending.indexOf(
      handle as { fn: () => void; ms: number }
    );
    if (index >= 0) this.pending.splice(index, 1);
  }
  runNext(): void {
    this.pending.shift()!.fn();
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const marks = (...yes: string[]): Marks => joinMarks(yes, []);

function setup() {
  const server = new FakeServer();
  const timers = new FakeTimers();
  const statuses: SaveStatus[] = [];
  const saved: number[] = [];
  const queue = new SaveQueue({
    baseRev: 0,
    send: server.send,
    onStatus: (status) => statuses.push(status),
    onSaved: (rev) => saved.push(rev),
    timers,
  });
  return { server, timers, statuses, saved, queue };
}

describe('SaveQueue', () => {
  it('saves a change and reports saving, then saved', async () => {
    const { server, queue, statuses, saved } = setup();
    queue.push(marks('2027-03-06'));
    expect(queue.busy).toBe(true);
    server.answer();
    await tick();
    expect(server.marks.yes).toEqual(['2027-03-06']);
    expect(statuses).toEqual(['saving', 'saved']);
    expect(saved).toEqual([1]);
    expect(queue.busy).toBe(false);
  });

  it('keeps one request in flight and sends only the newest state after it', async () => {
    const { server, queue } = setup();
    queue.push(marks('2027-03-06'));
    queue.push(marks('2027-03-06', '2027-03-07'));
    queue.push(marks('2027-03-07'));
    expect(server.open).toBe(1);
    server.answer();
    await tick();
    expect(server.open).toBe(1);
    server.answer();
    await tick();
    expect(server.requests.map((r) => r.yes)).toEqual([
      ['2027-03-06'],
      ['2027-03-07'],
    ]);
    expect(server.requests[1]!.baseRev).toBe(1);
    expect(server.marks.yes).toEqual(['2027-03-07']);
  });

  it('after a conflict takes the server revision and resends the latest state', async () => {
    const { server, queue, statuses } = setup();
    server.rev = 5; // another device saved meanwhile
    queue.push(marks('2027-03-06'));
    server.answer();
    await tick();
    expect(server.requests[1]).toEqual({
      baseRev: 5,
      yes: ['2027-03-06'],
      maybe: [],
    });
    server.answer();
    await tick();
    expect(server.marks.yes).toEqual(['2027-03-06']);
    expect(queue.baseRev).toBe(6);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('prefers a change made during a conflicting request over the conflicting one', async () => {
    const { server, queue } = setup();
    server.rev = 2;
    queue.push(marks('2027-03-06'));
    queue.push(marks('2027-03-08'));
    server.answer(); // conflict
    await tick();
    server.answer();
    await tick();
    expect(server.marks.yes).toEqual(['2027-03-08']);
  });

  it('retries after a network error with growing delays, the last one repeating', async () => {
    const { server, queue, timers, statuses } = setup();
    queue.push(marks('2027-03-06'));
    for (const delay of [...RETRY_DELAYS_MS, RETRY_DELAYS_MS.at(-1)!]) {
      server.fail(new Error('offline'));
      await tick();
      expect(statuses.at(-1)).toBe('retrying');
      expect(timers.pending.at(-1)!.ms).toBe(delay);
      timers.runNext();
      await tick();
    }
    server.answer();
    await tick();
    expect(server.marks.yes).toEqual(['2027-03-06']);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('sends a new change at once instead of waiting for the retry', async () => {
    const { server, queue, timers } = setup();
    queue.push(marks('2027-03-06'));
    server.fail(new Error('offline'));
    await tick();
    expect(timers.pending).toHaveLength(1);
    queue.push(marks('2027-03-07'));
    expect(timers.pending).toHaveLength(0);
    expect(server.open).toBe(1);
    server.answer();
    await tick();
    expect(server.marks.yes).toEqual(['2027-03-07']);
  });

  it('gives up on a permanent failure without retrying', async () => {
    const { server, queue, timers, statuses } = setup();
    queue.push(marks('2027-03-06'));
    server.fail(new PermanentSaveError('closed'));
    await tick();
    expect(statuses.at(-1)).toBe('failed');
    expect(timers.pending).toHaveLength(0);
    expect(queue.busy).toBe(false);
  });

  it('sends what is pending with keepalive as the page goes away', async () => {
    const sent: [SaveRequest, boolean][] = [];
    const queue = new SaveQueue({
      baseRev: 3,
      send: (request, keepalive) => {
        sent.push([request, keepalive]);
        return new Promise(() => undefined);
      },
    });
    queue.flushOnLeave(); // nothing pending: nothing sent
    expect(sent).toEqual([]);
    queue.push(marks('2027-03-06')); // in flight
    queue.push(marks('2027-03-07')); // pending
    // In flight already: the newest state goes out too, based on the
    // revision the request under way will make.
    queue.flushOnLeave();
    expect(sent).toHaveLength(2);
    expect(sent[1]![1]).toBe(true);
    expect(sent[1]![0]).toMatchObject({ baseRev: 4, yes: ['2027-03-07'] });
    // Nothing is left pending for a second leave.
    queue.flushOnLeave();
    expect(sent).toHaveLength(2);
  });

  it('neither sends nor retries once disposed of', async () => {
    let reject: (error: Error) => void = () => undefined;
    const timers: (() => void)[] = [];
    const sent: SaveRequest[] = [];
    const queue = new SaveQueue({
      baseRev: 0,
      send: (request) => {
        sent.push(request);
        return new Promise((_resolve, fail) => {
          reject = fail;
        });
      },
      timers: {
        setTimeout: (fn) => timers.push(fn),
        clearTimeout: () => undefined,
      },
    });
    queue.push(marks('2027-03-06'));
    queue.dispose();
    // The request under way fails like a network error would.
    reject(new Error('offline'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(timers).toEqual([]);
    queue.push(marks('2027-03-07'));
    queue.flushOnLeave();
    expect(sent).toHaveLength(1);
  });

  it('sends with keepalive when nothing is in flight', async () => {
    const { server, queue } = setup();
    // Reach a state with something pending and nothing in flight.
    (queue as unknown as { pending: Marks }).pending = marks('2027-03-06');
    queue.flushOnLeave();
    expect(server.keepalives).toEqual([true]);
    expect(queue.busy).toBe(true);
    server.answer();
    await tick();
    expect(queue.busy).toBe(false);
    expect(queue.baseRev).toBe(1);
  });

  it('sends every save with keepalive, so one under way outlives the page', async () => {
    const { server, queue } = setup();
    queue.push(marks('2027-03-06'));
    // One request in flight, nothing pending: leaving has nothing to add and
    // sends nothing, but the request under way already is a keepalive one.
    queue.flushOnLeave();
    expect(server.requests).toHaveLength(1);
    expect(server.keepalives).toEqual([true]);
    server.answer();
    await tick();
    queue.push(marks('2027-03-07'));
    server.answer();
    await tick();
    expect(server.keepalives).toEqual([true, true]);
  });

  it('keeps a retry after a failed save keepalive too', async () => {
    const { server, queue, timers } = setup();
    queue.push(marks('2027-03-06'));
    server.fail(new Error('offline'));
    await tick();
    timers.runNext();
    await tick();
    expect(server.keepalives).toEqual([true, true]);
  });

  it('sends an empty selection with keepalive, too', async () => {
    const { server, queue } = setup();
    queue.push(new Map());
    expect(server.requests[0]).toEqual({ baseRev: 0, yes: [], maybe: [] });
    expect(server.keepalives).toEqual([true]);
    queue.flushOnLeave();
    expect(server.requests).toHaveLength(1);
  });

  it('puts a change back and retries when the one sent on leaving fails', async () => {
    const { server, queue, timers, statuses } = setup();
    queue.push(marks('2027-03-06'));
    queue.push(marks('2027-03-07'));
    queue.flushOnLeave(); // the page is hidden, not gone
    expect(server.requests.map((r) => r.baseRev)).toEqual([0, 1]);
    server.fail(new Error('offline')); // the first one
    await tick();
    server.fail(new Error('offline')); // the one sent on leaving
    await tick();
    expect(statuses.at(-1)).toBe('retrying');
    expect(timers.pending).toHaveLength(1);
    timers.runNext();
    await tick();
    expect(server.requests.at(-1)!.yes).toEqual(['2027-03-07']);
    server.answer();
    await tick();
    expect(queue.busy).toBe(false);
  });

  it('takes the revision a request sent on leaving made, so the next change is not stale', async () => {
    const { server, queue } = setup();
    queue.push(marks('2027-03-06'));
    queue.push(marks('2027-03-07'));
    queue.flushOnLeave();
    server.answer(); // first lands, rev 1
    await tick();
    server.answer(); // second (baseRev 1) lands, rev 2
    await tick();
    expect(queue.baseRev).toBe(2);
    expect(server.marks.yes).toEqual(['2027-03-07']);
    queue.push(marks('2027-03-08'));
    expect(server.requests.at(-1)!.baseRev).toBe(2);
  });

  it('resends the state when the one sent on leaving was refused as stale', async () => {
    const { server, queue } = setup();
    server.rev = 4; // another device saved meanwhile
    (queue as unknown as { pending: Marks }).pending = marks('2027-03-06');
    queue.flushOnLeave();
    server.answer(); // conflict, nothing in flight
    await tick();
    expect(server.requests.at(-1)).toEqual({
      baseRev: 4,
      yes: ['2027-03-06'],
      maybe: [],
    });
    server.answer();
    await tick();
    expect(server.marks.yes).toEqual(['2027-03-06']);
  });

  it('ignores what comes back after the queue was disposed of', async () => {
    const { server, queue, timers } = setup();
    (queue as unknown as { pending: Marks }).pending = marks('2027-03-06');
    queue.flushOnLeave();
    queue.dispose();
    server.fail(new Error('gone'));
    await tick();
    expect(timers.pending).toHaveLength(0);
    expect(queue.busy).toBe(false);
  });

  it('leaves nothing to send once disposed of', () => {
    const { server, queue } = setup();
    queue.dispose();
    queue.push(marks('2027-03-06'));
    queue.flushOnLeave();
    expect(server.requests).toEqual([]);
  });

  it('drops pending work and timers when disposed', async () => {
    const { server, queue, timers } = setup();
    queue.push(marks('2027-03-06'));
    server.fail(new Error('offline'));
    await tick();
    queue.dispose();
    expect(timers.pending).toHaveLength(0);
    expect(queue.busy).toBe(false);
  });

  it('records "none of these days" as an empty save', async () => {
    const { server, queue } = setup();
    queue.push(new Map());
    server.answer();
    await tick();
    expect(server.requests[0]).toEqual({ baseRev: 0, yes: [], maybe: [] });
  });

  it('schedules a retry on the real timers, and cancels it on dispose', async () => {
    const queue = new SaveQueue({
      baseRev: 0,
      send: () => Promise.reject(new Error('offline')),
    });
    queue.push(marks('2027-03-06'));
    await tick();
    expect(queue.busy).toBe(true);
    queue.dispose();
    expect(queue.busy).toBe(false);
  });

  it('works with the real timers and no callbacks', async () => {
    let calls = 0;
    const queue = new SaveQueue({
      baseRev: 0,
      send: async () => {
        calls += 1;
        return { ok: true, rev: calls };
      },
    });
    queue.push(marks('2027-03-06'));
    await tick();
    expect(calls).toBe(1);
    queue.dispose();
  });

  it('starts over after dispose and revive, as when StrictMode remounts', async () => {
    const { server, queue } = setup();
    queue.dispose();
    queue.revive();
    queue.push(marks('2027-03-06'));
    expect(server.requests).toHaveLength(1);
    server.answer();
    await tick();
    expect(server.marks.yes).toEqual(['2027-03-06']);
    expect(queue.busy).toBe(false);
  });

  it('sends an empty selection after revive', async () => {
    const { server, queue } = setup();
    queue.dispose();
    queue.revive();
    queue.push(new Map());
    expect(server.requests).toEqual([{ baseRev: 0, yes: [], maybe: [] }]);
  });

  it('retries after revive, though it did not while disposed of', async () => {
    const { server, queue, timers } = setup();
    queue.push(marks('2027-03-06'));
    queue.dispose();
    queue.revive();
    server.fail(new Error('offline'));
    await tick();
    expect(timers.pending).toHaveLength(1);
    timers.runNext();
    await tick();
    expect(server.requests).toHaveLength(2);
  });

  it('keeps a single request in flight across dispose, revive and a new push', async () => {
    const { server, queue } = setup();
    queue.push(marks('2027-03-06'));
    queue.dispose();
    queue.revive();
    queue.push(marks('2027-03-07'));
    expect(server.open).toBe(1);
    server.answer();
    await tick();
    expect(server.open).toBe(1);
    server.answer();
    await tick();
    expect(server.marks.yes).toEqual(['2027-03-07']);
    expect(queue.busy).toBe(false);
  });

  it('is revived by attach and disposed of again by its undo', () => {
    const browser = installBrowser();
    const { server, queue } = setup();
    queue.dispose();
    const detach = queue.attach();
    expect(browser.window.listenerCount('pagehide')).toBe(1);
    expect(browser.document.listenerCount('visibilitychange')).toBe(1);
    queue.push(marks('2027-03-06'));
    expect(server.requests).toHaveLength(1);
    detach();
    expect(browser.window.listenerCount('pagehide')).toBe(0);
    expect(browser.document.listenerCount('visibilitychange')).toBe(0);
    queue.push(marks('2027-03-07'));
    expect(server.requests).toHaveLength(1);
  });

  it('sends what is still pending, with keepalive, when the undo of attach runs', () => {
    const browser = installBrowser();
    const { server, queue } = setup();
    const detach = queue.attach();
    queue.push(marks('2027-03-06')); // in flight
    queue.push(marks('2027-03-07')); // pending
    detach(); // the panel goes away, the page stays
    expect(server.requests).toHaveLength(2);
    expect(server.requests[1]).toEqual({
      baseRev: 1,
      yes: ['2027-03-07'],
      maybe: [],
    });
    expect(server.keepalives).toEqual([true, true]);
    expect(browser.window.listenerCount('pagehide')).toBe(0);
  });

  it('sends nothing when the undo of attach runs with nothing pending', () => {
    installBrowser();
    const { server, queue } = setup();
    const detach = queue.attach();
    detach();
    expect(server.requests).toHaveLength(0);
    queue.push(marks('2027-03-06')); // disposed of: ignored
    expect(server.requests).toHaveLength(0);
  });

  it('sends an empty selection that is pending when the undo of attach runs', () => {
    installBrowser();
    const { server, queue } = setup();
    const detach = queue.attach();
    queue.push(marks('2027-03-06')); // in flight
    queue.push(new Map()); // pending: "none of these days"
    detach();
    expect(server.requests[1]).toEqual({ baseRev: 1, yes: [], maybe: [] });
  });

  it('does not send the same state twice across a StrictMode remount', () => {
    installBrowser();
    const { server, queue } = setup();
    const first = queue.attach();
    queue.push(marks('2027-03-06')); // in flight
    queue.push(marks('2027-03-07')); // pending
    first(); // cleanup: flushes the pending state once
    const second = queue.attach();
    expect(server.requests).toHaveLength(2);
    second();
    expect(server.requests).toHaveLength(2);
  });

  it('survives a StrictMode remount: attach, undo, attach', () => {
    const browser = installBrowser();
    const { server, queue } = setup();
    const first = queue.attach();
    first();
    const second = queue.attach();
    expect(browser.window.listenerCount('pagehide')).toBe(1);
    queue.push(marks('2027-03-06'));
    expect(server.requests).toHaveLength(1);
    second();
  });

  it('flushes on pagehide and when the page is hidden, not when it is shown', () => {
    const browser = installBrowser();
    const { server, queue } = setup();
    const detach = queue.attach();
    queue.push(marks('2027-03-06')); // in flight
    queue.push(marks('2027-03-07')); // pending
    browser.document.visibilityState = 'visible';
    browser.document.dispatch('visibilitychange');
    expect(server.requests).toHaveLength(1);
    browser.document.visibilityState = 'hidden';
    browser.document.dispatch('visibilitychange');
    expect(server.requests).toHaveLength(2);
    expect(server.keepalives).toEqual([true, true]);
    queue.push(marks('2027-03-08'));
    browser.window.dispatch('pagehide');
    expect(server.requests).toHaveLength(3);
    detach();
  });

  it('does not let an older request that failed overtake the newer one sent on leaving', async () => {
    const { server, queue, timers, statuses } = setup();
    queue.push(marks('2027-03-06'));
    queue.push(marks('2027-03-07'));
    queue.flushOnLeave();
    server.fail(new Error('offline')); // the older one
    await tick();
    expect(timers.pending).toHaveLength(0);
    expect(queue.busy).toBe(true);
    // The newer one was based on a revision that never came: stale. The
    // server's revision is taken and the newest state goes out again.
    server.answer();
    await tick();
    expect(server.requests.at(-1)).toEqual({
      baseRev: 0,
      yes: ['2027-03-07'],
      maybe: [],
    });
    server.answer();
    await tick();
    expect(server.marks.yes).toEqual(['2027-03-07']);
    expect(statuses.at(-1)).toBe('saved');
    expect(queue.busy).toBe(false);
  });

  it('ends failed when what was sent on leaving is refused for good', async () => {
    const { server, queue, timers, statuses } = setup();
    (queue as unknown as { pending: Marks }).pending = marks('2027-03-06');
    queue.flushOnLeave();
    server.fail(new PermanentSaveError('closed'));
    await tick();
    expect(statuses.at(-1)).toBe('failed');
    expect(timers.pending).toHaveLength(0);
    expect(queue.busy).toBe(false);
  });
});
