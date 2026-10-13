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

/**
 * A send function whose answers the test hands out one by one. Requests are
 * numbered in the order they were sent; without a number, the oldest request
 * still open is meant.
 */
class FakeServer {
  rev = 0;
  marks = { yes: [] as string[], maybe: [] as string[] };
  readonly requests: SaveRequest[] = [];
  private readonly entries: {
    request: SaveRequest;
    resolve(r: SendResult): void;
    reject(e: unknown): void;
    outcome?: SendResult;
    settled: boolean;
  }[] = [];

  send = (request: SaveRequest): Promise<SendResult> => {
    this.requests.push(request);
    return new Promise((resolve, reject) =>
      this.entries.push({ request, resolve, reject, settled: false })
    );
  };

  /**
   * The server handles a request the way the real one would — applied if its
   * base is the current revision, refused otherwise — without the answer
   * reaching the page yet. Handled once; asking again returns the same.
   */
  apply(index = this.oldestOpen()): SendResult {
    const entry = this.entries[index]!;
    if (entry.outcome === undefined) {
      if (entry.request.baseRev !== this.rev) {
        entry.outcome = { ok: false, rev: this.rev };
      } else {
        this.rev += 1;
        this.marks = { yes: entry.request.yes, maybe: entry.request.maybe };
        entry.outcome = { ok: true, rev: this.rev };
      }
    }
    return entry.outcome;
  }

  /** Handle a request and let its answer arrive. */
  answer(index = this.oldestOpen()): void {
    const outcome = this.apply(index);
    this.settle(index).resolve(outcome);
  }

  /** The request never gets an answer: a network error, a timeout. */
  fail(error: unknown, index = this.oldestOpen()): void {
    this.settle(index).reject(error);
  }

  get open(): number {
    return this.entries.filter((entry) => !entry.settled).length;
  }

  private oldestOpen(): number {
    return this.entries.findIndex((entry) => !entry.settled);
  }

  private settle(index: number) {
    const entry = this.entries[index]!;
    expect(entry.settled, `request ${index} answered twice`).toBe(false);
    entry.settled = true;
    return entry;
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

  it('sends what is pending as the page goes away', async () => {
    const sent: SaveRequest[] = [];
    const queue = new SaveQueue({
      baseRev: 3,
      send: (request) => {
        sent.push(request);
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
    expect(sent[1]).toMatchObject({ baseRev: 4, yes: ['2027-03-07'] });
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

  it('sends on leaving when nothing is in flight', async () => {
    const { server, queue } = setup();
    // Reach a state with something pending and nothing in flight.
    (queue as unknown as { pending: Marks }).pending = marks('2027-03-06');
    queue.flushOnLeave();
    expect(server.requests).toHaveLength(1);
    expect(queue.busy).toBe(true);
    server.answer();
    await tick();
    expect(queue.busy).toBe(false);
    expect(queue.baseRev).toBe(1);
  });

  it('sends nothing on leaving when the only change is under way already', async () => {
    const { server, queue } = setup();
    queue.push(marks('2027-03-06'));
    queue.flushOnLeave();
    expect(server.requests).toHaveLength(1);
    server.answer();
    await tick();
    queue.push(marks('2027-03-07'));
    server.answer();
    await tick();
    expect(server.requests.map((r) => r.yes)).toEqual([
      ['2027-03-06'],
      ['2027-03-07'],
    ]);
  });

  it('sends the same state again on a retry', async () => {
    const { server, queue, timers } = setup();
    queue.push(marks('2027-03-06'));
    server.fail(new Error('offline'));
    await tick();
    timers.runNext();
    await tick();
    expect(server.requests).toHaveLength(2);
    expect(server.requests[1]).toEqual(server.requests[0]);
  });

  it('sends an empty selection at once, and nothing more on leaving', async () => {
    const { server, queue } = setup();
    queue.push(new Map());
    expect(server.requests[0]).toEqual({ baseRev: 0, yes: [], maybe: [] });
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

  it('sends what is still pending when the undo of attach runs', () => {
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

const SCHEDULES = 1000;

/** A deterministic generator, so a failing schedule can be replayed by its seed. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Let the queue's promise continuations run, without waiting for a timer. */
async function drain(): Promise<void> {
  for (let hop = 0; hop < 12; hop += 1) await Promise.resolve();
}

/**
 * One random schedule of pushes, leave requests, answers, losses and retries,
 * followed by a network that works again. Returns what is wrong at the end, if
 * anything.
 */
async function schedule(
  seed: number,
  loss: number
): Promise<{ problem: string | null }> {
  const random = generator(seed);
  const server = new FakeServer();
  const timers = new FakeTimers();
  const queue = new SaveQueue({ baseRev: 0, send: server.send, timers });
  let newest: string[] = [];
  let pushes = 0;
  const steps = 4 + Math.floor(random() * 28);
  for (let step = 0; step < steps; step += 1) {
    const roll = random();
    if (roll < 0.3) {
      pushes += 1;
      // Every state differs; one in six is "none of these days".
      newest =
        random() < 1 / 6 ? [] : [`2027-03-${String(pushes).padStart(2, '0')}`];
      queue.push(joinMarks(newest, []));
    } else if (roll < 0.45) {
      queue.flushOnLeave();
    } else if (roll < 0.9) {
      if (server.open > 0) {
        if (random() >= loss) server.answer();
        else {
          // Lost on the way, or handled and then lost on the way back.
          if (random() < 0.5) server.apply();
          server.fail(new Error('lost'));
        }
      }
    } else if (timers.pending.length > 0) {
      timers.runNext();
    }
    await drain();
  }
  for (
    let guard = 0;
    guard < 200 && (server.open > 0 || timers.pending.length > 0);
    guard += 1
  ) {
    if (server.open > 0) server.answer();
    else timers.runNext();
    await drain();
  }
  if (queue.busy) return { problem: 'still busy' };
  if (JSON.stringify(server.marks.yes) !== JSON.stringify(newest))
    return {
      problem: `server holds ${JSON.stringify(server.marks.yes)}, last pushed ${JSON.stringify(newest)}`,
    };
  return { problem: null };
}

/**
 * A request sent on leaving overlaps the saves under way. Which state is the
 * newest decides what a refusal or a failure may put back: an older one must
 * never be resent over a newer one, and the newest must never be dropped.
 */
describe('SaveQueue, a request sent on leaving among saves under way', () => {
  /** A under way (request 0), B sent on leaving (1), C pushed after it. */
  async function leaveBetween(c: Marks | null = marks('2027-03-03')) {
    const context = setup();
    const { server, queue } = context;
    queue.push(marks('2027-03-01'));
    queue.push(marks('2027-03-02'));
    queue.flushOnLeave();
    expect(server.requests.map((r) => r.baseRev)).toEqual([0, 1]);
    server.answer(0);
    await tick();
    if (c) queue.push(c);
    return context;
  }

  it('resends the newest state when it is refused before the answer to the leave request', async () => {
    const { server, queue, statuses } = await leaveBetween();
    expect(server.requests.map((r) => r.baseRev)).toEqual([0, 1, 1]);
    server.apply(1); // the leave request lands first: rev 2
    server.answer(2); // the newest, based on rev 1, is refused
    await tick();
    expect(server.requests).toHaveLength(4);
    expect(server.requests[3]).toEqual({
      baseRev: 2,
      yes: ['2027-03-03'],
      maybe: [],
    });
    server.answer(1); // the answer to the leave request, late
    await tick();
    expect(queue.busy).toBe(true);
    server.answer(3);
    await tick();
    expect(server.marks.yes).toEqual(['2027-03-03']);
    expect(queue.baseRev).toBe(3);
    expect(queue.busy).toBe(false);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('does not resend the older leave state over the newest one that landed first', async () => {
    const { server, queue, statuses } = await leaveBetween();
    server.answer(2); // the newest lands: rev 2
    await tick();
    server.answer(1); // the leave request, based on rev 1, is refused late
    await tick();
    expect(server.requests).toHaveLength(3);
    expect(server.marks.yes).toEqual(['2027-03-03']);
    expect(queue.baseRev).toBe(2);
    expect(queue.busy).toBe(false);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('does not resend the older leave state while the newest is still under way', async () => {
    const { server, queue } = await leaveBetween();
    server.apply(2); // the newest lands, its answer is on the way
    server.answer(1); // refused
    await tick();
    expect(server.requests).toHaveLength(3);
    expect(queue.busy).toBe(true);
    server.answer(2);
    await tick();
    expect(server.requests).toHaveLength(3);
    expect(server.marks.yes).toEqual(['2027-03-03']);
    expect(queue.busy).toBe(false);
  });

  it('sends the newest state once a save that landed unanswered is out of the way', async () => {
    const context = setup();
    const { server, queue, timers, statuses } = context;
    queue.push(marks('2027-03-01'));
    queue.push(marks('2027-03-02'));
    queue.flushOnLeave();
    queue.push(marks('2027-03-03'));
    server.apply(0); // the first save landed, but its answer is lost
    server.fail(new Error('timed out'), 0);
    await tick();
    expect(timers.pending).toHaveLength(0);
    server.answer(1); // the leave request lands: rev 2
    await tick();
    expect(server.requests).toHaveLength(3);
    expect(server.requests[2]).toEqual({
      baseRev: 2,
      yes: ['2027-03-03'],
      maybe: [],
    });
    expect(statuses.at(-1)).toBe('saving');
    server.answer(2);
    await tick();
    expect(server.marks.yes).toEqual(['2027-03-03']);
    expect(queue.busy).toBe(false);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('retries the newest state when the save and then the leave request fail', async () => {
    const { server, queue, timers, statuses } = setup();
    queue.push(marks('2027-03-01'));
    queue.push(marks('2027-03-02'));
    queue.flushOnLeave();
    queue.push(marks('2027-03-03'));
    server.fail(new Error('offline'), 0);
    await tick();
    server.fail(new Error('offline'), 1);
    await tick();
    expect(statuses.at(-1)).toBe('retrying');
    expect(timers.pending).toHaveLength(1);
    // Retrying means the newest state, not the older one the leave request had.
    timers.runNext();
    await tick();
    expect(server.requests.at(-1)).toEqual({
      baseRev: 0,
      yes: ['2027-03-03'],
      maybe: [],
    });
    server.answer();
    await tick();
    expect(server.marks.yes).toEqual(['2027-03-03']);
    expect(queue.busy).toBe(false);
  });

  it('is not left retrying when the leave request fails after a newer state landed', async () => {
    const { server, queue, timers, statuses } = await leaveBetween();
    server.answer(2); // the newest lands
    await tick();
    server.fail(new Error('offline'), 1); // the older leave request does not
    await tick();
    expect(timers.pending).toHaveLength(0);
    expect(statuses.at(-1)).toBe('saved');
    expect(queue.busy).toBe(false);
  });

  it('is not left retrying when a save that was overtaken fails last', async () => {
    const { server, queue, timers, statuses } = setup();
    queue.push(marks('2027-03-01'));
    queue.push(marks('2027-03-02'));
    queue.flushOnLeave();
    server.apply(0); // the save landed, its answer is on the way
    server.answer(1); // the leave request lands after it: rev 2
    await tick();
    server.fail(new Error('timed out'), 0); // the answer to the save is lost
    await tick();
    expect(timers.pending).toHaveLength(0);
    expect(queue.busy).toBe(false);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('sends nothing when leaving with nothing pending, before and after saves', async () => {
    const { server, queue } = setup();
    queue.flushOnLeave();
    expect(server.requests).toEqual([]);
    queue.push(marks('2027-03-01'));
    queue.flushOnLeave(); // the save under way is all there is
    server.answer();
    await tick();
    queue.flushOnLeave();
    expect(server.requests).toHaveLength(1);
    expect(queue.busy).toBe(false);
  });

  it('sends a second leave request for what was pushed after the first', async () => {
    const { server, queue, statuses } = setup();
    queue.push(marks('2027-03-01'));
    queue.push(marks('2027-03-02'));
    queue.flushOnLeave();
    queue.push(marks('2027-03-03'));
    queue.flushOnLeave();
    // Both leave requests are based on the revision the first save will make.
    expect(server.requests.map((r) => r.baseRev)).toEqual([0, 1, 1]);
    server.answer(0);
    await tick();
    server.answer(1);
    await tick();
    server.answer(2); // refused: the first leave request landed before it
    await tick();
    expect(server.requests).toHaveLength(4);
    expect(server.requests[3]).toEqual({
      baseRev: 2,
      yes: ['2027-03-03'],
      maybe: [],
    });
    server.answer(3);
    await tick();
    expect(server.marks.yes).toEqual(['2027-03-03']);
    expect(queue.busy).toBe(false);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('resends a state refused on leaving once, on the server revision', async () => {
    const { server, queue } = setup();
    server.rev = 4;
    queue.push(marks('2027-03-01'));
    queue.push(marks('2027-03-02'));
    queue.flushOnLeave();
    server.answer(0); // refused: rev 4
    await tick();
    server.answer(1); // the leave request is refused, too
    await tick();
    // Both were refused; the newest state goes out once, not once per refusal.
    expect(server.requests.map((r) => r.baseRev)).toEqual([0, 1, 4]);
    expect(server.requests[2]!.yes).toEqual(['2027-03-02']);
    server.answer(2);
    await tick();
    expect(server.requests).toHaveLength(3);
    expect(server.marks.yes).toEqual(['2027-03-02']);
    expect(queue.baseRev).toBe(5);
    expect(queue.busy).toBe(false);
  });

  it('adopts the server revision and resends the state when the leave request is refused with nothing newer sent', async () => {
    const { server, queue } = await leaveBetween(null);
    server.rev = 6; // someone else saved
    server.answer(1); // the leave request is refused: rev 6
    await tick();
    expect(queue.baseRev).toBe(6);
    expect(server.requests).toHaveLength(3);
    expect(server.requests[2]).toEqual({
      baseRev: 6,
      yes: ['2027-03-02'],
      maybe: [],
    });
    server.answer(2);
    await tick();
    expect(server.requests).toHaveLength(3);
    expect(server.marks.yes).toEqual(['2027-03-02']);
    expect(queue.busy).toBe(false);
  });

  it('puts an empty selection back like any other state', async () => {
    const { server, queue, timers, statuses } = setup();
    queue.push(marks('2027-03-01'));
    queue.push(new Map()); // "none of these days"
    queue.flushOnLeave();
    server.answer(0);
    await tick();
    server.fail(new Error('offline'), 1);
    await tick();
    expect(statuses.at(-1)).toBe('retrying');
    timers.runNext();
    await tick();
    expect(server.requests.at(-1)).toEqual({ baseRev: 1, yes: [], maybe: [] });
    server.answer();
    await tick();
    expect(server.marks).toEqual({ yes: [], maybe: [] });
    expect(queue.busy).toBe(false);
  });

  it('resends an empty selection that was refused as stale', async () => {
    const { server, queue } = setup();
    server.rev = 3;
    server.marks = { yes: ['2027-03-01'], maybe: [] };
    queue.push(new Map());
    server.answer();
    await tick();
    expect(server.requests[1]).toEqual({ baseRev: 3, yes: [], maybe: [] });
    server.answer();
    await tick();
    expect(server.marks).toEqual({ yes: [], maybe: [] });
    expect(queue.busy).toBe(false);
  });

  it('ignores a late answer to the leave request once disposed of', async () => {
    for (const answer of ['ok', 'refused'] as const) {
      const { server, queue, timers, saved } = setup();
      queue.push(marks('2027-03-01'));
      queue.push(marks('2027-03-02'));
      queue.flushOnLeave();
      queue.dispose();
      if (answer === 'refused') server.rev = 5;
      server.answer(0);
      await tick();
      server.answer(1);
      await tick();
      // Neither a resend, nor a retry, nor a report of the leave request.
      expect(server.requests, answer).toHaveLength(2);
      expect(timers.pending, answer).toHaveLength(0);
      expect(saved, answer).toEqual(answer === 'ok' ? [1] : []);
      expect(queue.busy, answer).toBe(false);
    }
  });

  it('ends with the last state pushed, whatever the order of arrivals, losses and leave requests', async () => {
    // Requests arrive and are answered in the order they were sent; some are
    // lost on the way or their answer is. At the end the network is back.
    const wrong: string[] = [];
    for (const loss of [0, 0.2, 0.4]) {
      for (let seed = 1; seed <= SCHEDULES; seed += 1) {
        const outcome = await schedule(seed, loss);
        if (outcome.problem)
          wrong.push(`seed ${seed}, loss ${loss}: ${outcome.problem}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

/**
 * A save under way that fails after a newer state went out on leaving: the
 * queue may only call that "saved" when the newer state really landed.
 */
describe('SaveQueue, an overtaken save that fails', () => {
  /** A under way (request 0), B sent on leaving (request 1). */
  function leaveWhileSaving() {
    const context = setup();
    context.queue.push(marks('2027-03-01'));
    context.queue.push(marks('2027-03-02'));
    context.queue.flushOnLeave();
    expect(context.server.requests).toHaveLength(2);
    return context;
  }

  it('stays failed when the newer state was refused for good', async () => {
    const { server, queue, timers, statuses } = leaveWhileSaving();
    server.fail(new PermanentSaveError('forbidden'), 1);
    await tick();
    expect(statuses.at(-1)).toBe('failed');
    server.fail(new Error('network'), 0);
    await tick();
    expect(statuses.at(-1)).toBe('failed');
    expect(statuses).not.toContain('saved');
    expect(timers.pending).toHaveLength(0);
    expect(server.requests).toHaveLength(2);
    expect(queue.busy).toBe(false);
  });

  it('says saved when the newer state landed', async () => {
    const { server, queue, timers, statuses } = leaveWhileSaving();
    server.apply(0); // A lands, but its answer is lost
    server.answer(1);
    await tick();
    server.fail(new Error('network'), 0);
    await tick();
    expect(server.marks.yes).toEqual(['2027-03-02']);
    expect(statuses.at(-1)).toBe('saved');
    expect(timers.pending).toHaveLength(0);
    expect(server.requests).toHaveLength(2);
    expect(queue.busy).toBe(false);
  });

  it('sends nothing more when the newer state is still on its way', async () => {
    const { server, queue, timers, statuses } = leaveWhileSaving();
    server.apply(0); // A lands, but its answer is lost
    server.fail(new Error('network'), 0);
    await tick();
    expect(statuses.at(-1)).not.toBe('saved');
    expect(timers.pending).toHaveLength(0);
    server.answer(1);
    await tick();
    expect(statuses.at(-1)).toBe('saved');
    expect(server.requests).toHaveLength(2);
    expect(queue.busy).toBe(false);
  });
});
