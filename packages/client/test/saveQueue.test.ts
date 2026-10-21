import { joinMarks, splitMarks, type Marks } from '@owl/shared';
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
import { hasUnsavedInput } from '../src/lib/reloadGuard.ts';
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
        entry.outcome = {
          ok: false,
          rev: this.rev,
          yes: [...this.marks.yes],
          maybe: [...this.marks.maybe],
        };
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

  it('sends nothing when the undo of attach runs with nothing pending', () => {
    installBrowser();
    const { server, queue } = setup();
    const detach = queue.attach();
    detach();
    expect(server.requests).toHaveLength(0);
    queue.push(marks('2027-03-06')); // disposed of: ignored
    expect(server.requests).toHaveLength(0);
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

/** Leaving while saves are under way or failing. */
describe('SaveQueue, leaving among saves', () => {
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
});

const D1 = '2027-03-01';
const D2 = '2027-03-02';
const D3 = '2027-03-03';
const D4 = '2027-03-04';

/** A queue whose first request failed, so its state waits for a retry. */
async function failedOnce() {
  const context = setup();
  context.queue.push(marks(D1));
  context.server.fail(new Error('offline'));
  await tick();
  expect(context.timers.pending).toHaveLength(1);
  return context;
}

describe('SaveQueue, reload guard', () => {
  it('holds a language reload back while marks are unsaved, from attach to its undo', async () => {
    installBrowser();
    const { server, queue } = setup();
    const detach = queue.attach();
    expect(hasUnsavedInput()).toBe(false);
    queue.push(marks(D1));
    expect(hasUnsavedInput()).toBe(true);
    server.answer();
    await tick();
    expect(hasUnsavedInput()).toBe(false);
    queue.push(marks(D2));
    detach();
    expect(hasUnsavedInput()).toBe(false);
  });
});

describe('SaveQueue, leaving', () => {
  it('sends the state waiting for a retry, on the revision it knows', async () => {
    const { server, queue, timers } = await failedOnce();
    queue.flushOnLeave();
    expect(timers.pending).toHaveLength(0);
    expect(server.requests.map((r) => r.baseRev)).toEqual([0, 0]);
    server.answer();
    await tick();
    expect(server.marks.yes).toEqual([D1]);
    expect(queue.busy).toBe(false);
  });

  it('guesses no revision while a save is under way: the state follows its answer', async () => {
    const { server, queue, statuses } = setup();
    queue.push(marks(D1));
    queue.push(marks(D2)); // pending
    queue.flushOnLeave();
    queue.flushOnLeave();
    expect(server.requests).toHaveLength(1);
    expect(queue.busy).toBe(true);
    server.answer();
    await tick();
    expect(server.requests).toHaveLength(2);
    expect(server.requests[1]).toEqual({ baseRev: 1, yes: [D2], maybe: [] });
    server.answer();
    await tick();
    expect(server.marks.yes).toEqual([D2]);
    expect(statuses.at(-1)).toBe('saved');
    expect(queue.busy).toBe(false);
  });

  it('never overwrites a save another device made meanwhile', async () => {
    const { server, queue } = setup();
    queue.push(marks(D1));
    queue.push(marks(D2));
    queue.flushOnLeave();
    // Another device saved first: the server is at rev 1 with its marks.
    server.rev = 1;
    server.marks = { yes: [D4], maybe: [] };
    server.answer(); // the first request is refused
    await tick();
    // No request went out on a guessed revision; the retry is on rev 1.
    expect(server.requests.map((r) => r.baseRev)).toEqual([0, 1]);
  });

  it('keeps the pending state through the undo of attach and sends it after the answer', async () => {
    const browser = installBrowser();
    const { server, queue } = setup();
    const detach = queue.attach();
    queue.push(marks(D1)); // in flight
    queue.push(marks(D2)); // pending
    detach(); // the panel goes away, the page stays
    expect(browser.window.listenerCount('pagehide')).toBe(0);
    expect(server.requests).toHaveLength(1);
    server.answer();
    await tick();
    expect(server.requests[1]).toEqual({ baseRev: 1, yes: [D2], maybe: [] });
    server.answer();
    await tick();
    expect(server.marks.yes).toEqual([D2]);
    expect(queue.busy).toBe(false);
  });

  it('does the same for an empty selection', async () => {
    installBrowser();
    const { server, queue } = setup();
    const detach = queue.attach();
    queue.push(marks(D1));
    queue.push(new Map()); // "none of these days"
    detach();
    server.answer();
    await tick();
    expect(server.requests[1]).toEqual({ baseRev: 1, yes: [], maybe: [] });
  });

  it('sends the state once, not twice, across a StrictMode remount', async () => {
    installBrowser();
    const { server, queue } = setup();
    const first = queue.attach();
    queue.push(marks(D1));
    queue.push(marks(D2));
    first();
    const second = queue.attach();
    server.answer();
    await tick();
    expect(server.requests).toHaveLength(2);
    server.answer();
    await tick();
    second();
    expect(server.requests).toHaveLength(2);
    expect(queue.busy).toBe(false);
  });

  it('does not drain a state pushed after the queue was disposed of', async () => {
    const { server, queue } = setup();
    queue.push(marks(D1));
    queue.dispose();
    queue.push(marks(D2));
    server.answer();
    await tick();
    expect(server.requests).toHaveLength(1);
  });

  it('flushes on pagehide and when the page is hidden, not when it is shown', async () => {
    const browser = installBrowser();
    const { server, queue, timers } = setup();
    const detach = queue.attach();
    queue.push(marks(D1));
    server.fail(new Error('offline'));
    await tick();
    expect(timers.pending).toHaveLength(1);
    browser.document.visibilityState = 'visible';
    browser.document.dispatch('visibilitychange');
    expect(server.requests).toHaveLength(1);
    browser.document.visibilityState = 'hidden';
    browser.document.dispatch('visibilitychange');
    expect(server.requests).toHaveLength(2);
    server.answer();
    await tick();
    queue.push(marks(D2));
    server.fail(new Error('offline'));
    await tick();
    browser.window.dispatch('pagehide');
    expect(server.requests).toHaveLength(4);
    detach();
  });

  it('puts a state back and retries when the one sent on leaving fails', async () => {
    const { server, queue, timers, statuses } = await failedOnce();
    queue.flushOnLeave();
    server.fail(new Error('offline'));
    await tick();
    expect(statuses.at(-1)).toBe('retrying');
    expect(timers.pending).toHaveLength(1);
    timers.runNext();
    await tick();
    server.answer();
    await tick();
    expect(server.marks.yes).toEqual([D1]);
    expect(queue.busy).toBe(false);
  });

  it('ends failed when what was sent on leaving is refused for good', async () => {
    const { server, queue, timers, statuses } = await failedOnce();
    queue.flushOnLeave();
    server.fail(new PermanentSaveError('closed'));
    await tick();
    expect(statuses.at(-1)).toBe('failed');
    expect(timers.pending).toHaveLength(0);
    expect(queue.busy).toBe(false);
  });

  it('ignores a late answer to the leave request once disposed of', async () => {
    for (const answer of ['ok', 'refused'] as const) {
      const { server, queue, timers, saved } = await failedOnce();
      queue.flushOnLeave();
      queue.dispose();
      if (answer === 'refused') server.rev = 5;
      server.answer(1);
      await tick();
      expect(server.requests, answer).toHaveLength(2);
      expect(timers.pending, answer).toHaveLength(0);
      expect(saved, answer).toEqual([]);
      expect(queue.busy, answer).toBe(false);
    }
  });
});

/** Answers the test makes up, to put them in an order a network can produce. */
function scripted(options: { marks?: Marks } = {}) {
  const waiting: {
    resolve(result: SendResult): void;
    reject(error: unknown): void;
  }[] = [];
  const requests: SaveRequest[] = [];
  const timers = new FakeTimers();
  const statuses: SaveStatus[] = [];
  const merged: Marks[] = [];
  const queue = new SaveQueue({
    baseRev: 0,
    ...(options.marks && { marks: options.marks }),
    send: (request) => {
      requests.push(request);
      return new Promise<SendResult>((resolve, reject) =>
        waiting.push({ resolve, reject })
      );
    },
    onStatus: (status) => statuses.push(status),
    onMerged: (marks) => merged.push(marks),
    timers,
  });
  return { queue, requests, waiting, timers, statuses, merged };
}

describe('SaveQueue, answers out of order', () => {
  /** A failed (retry waiting), B sent on leaving (1), C pushed after it (2). */
  async function leaveThenSave() {
    const context = scripted();
    context.queue.push(marks(D1));
    context.waiting[0]!.reject(new Error('offline'));
    await tick();
    context.queue.flushOnLeave();
    context.queue.push(marks(D2));
    expect(context.requests).toHaveLength(3);
    return context;
  }

  it('keeps the highest revision when the leave answer comes before the save answer', async () => {
    const { queue, waiting, statuses } = await leaveThenSave();
    waiting[1]!.resolve({ ok: true, rev: 5 });
    await tick();
    waiting[2]!.resolve({ ok: true, rev: 3 });
    await tick();
    expect(queue.baseRev).toBe(5);
    expect(statuses.at(-1)).toBe('saved');
    expect(queue.busy).toBe(false);
  });

  it('keeps the highest revision when the save answer comes before the leave answer', async () => {
    const { queue, waiting } = await leaveThenSave();
    waiting[2]!.resolve({ ok: true, rev: 5 });
    await tick();
    waiting[1]!.resolve({ ok: true, rev: 3 });
    await tick();
    expect(queue.baseRev).toBe(5);
  });

  it('does not move the base back on a stale answer with an older revision', async () => {
    const { queue, waiting } = scripted();
    queue.push(marks(D1));
    waiting[0]!.resolve({ ok: true, rev: 7 });
    await tick();
    queue.push(marks(D2));
    waiting[1]!.resolve({ ok: false, rev: 4, yes: [], maybe: [] });
    await tick();
    expect(queue.baseRev).toBe(7);
  });

  it('settles on saved when a superseded leave request is refused last', async () => {
    const { waiting, statuses, queue } = await leaveThenSave();
    waiting[2]!.resolve({ ok: true, rev: 2 });
    await tick();
    waiting[1]!.resolve({ ok: false, rev: 2, yes: [D2], maybe: [] });
    await tick();
    expect(statuses.at(-1)).toBe('saved');
    expect(queue.busy).toBe(false);
  });

  it('settles on saved when a superseded leave request fails last', async () => {
    const { waiting, statuses, timers } = await leaveThenSave();
    waiting[2]!.resolve({ ok: true, rev: 1 });
    await tick();
    waiting[1]!.reject(new Error('offline'));
    await tick();
    expect(statuses.at(-1)).toBe('saved');
    expect(timers.pending).toHaveLength(0);
  });

  it('does not say saved over a permanent failure when an older request answers', async () => {
    const { waiting, statuses } = await leaveThenSave();
    waiting[2]!.reject(new PermanentSaveError('closed'));
    await tick();
    // The leave request is still to answer; its answer carries on.
    waiting[1]!.resolve({ ok: false, rev: 1, yes: [], maybe: [] });
    await tick();
    waiting[3]!.reject(new PermanentSaveError('closed'));
    await tick();
    expect(statuses.at(-1)).toBe('failed');
    expect(statuses).not.toContain('saved');
  });

  it('settles on saved when the newest request fails while an older leave request lands later', async () => {
    const { waiting, statuses, queue, timers } = await leaveThenSave();
    waiting[2]!.reject(new Error('offline'));
    await tick();
    // The leave request is still to answer: its answer carries on.
    expect(timers.pending).toHaveLength(0);
    waiting[1]!.resolve({ ok: true, rev: 1 });
    await tick();
    // The newest state was restored and goes out on rev 1.
    expect(waiting).toHaveLength(4);
    waiting[3]!.resolve({ ok: true, rev: 2 });
    await tick();
    expect(statuses.at(-1)).toBe('saved');
    expect(queue.baseRev).toBe(2);
  });
});

describe('SaveQueue, a stale answer keeps what another device saved', () => {
  const stale = (rev: number, yes: string[], maybe: string[] = []) =>
    ({ ok: false, rev, yes, maybe }) as const;

  it('puts our changes on the server marks, not the whole local set over them', async () => {
    const { queue, waiting, requests, merged } = scripted({
      marks: joinMarks([D1], []),
    });
    queue.push(joinMarks([D1], [D3])); // we added D3 as maybe
    waiting[0]!.resolve(stale(1, [D1, D2])); // another device added D2
    await tick();
    expect(requests[1]).toEqual({ baseRev: 1, yes: [D1, D2], maybe: [D3] });
    waiting[1]!.resolve({ ok: true, rev: 2 });
    await tick();
    // The screen is told about the marks that joined its own.
    expect(merged).toHaveLength(1);
    expect(splitMarks(merged[0]!)).toEqual({ yes: [D1, D2], maybe: [D3] });
  });

  it('keeps a removal the other device made, and our removal against its keep', async () => {
    const { queue, waiting, requests } = scripted({
      marks: joinMarks([D1, D2], []),
    });
    queue.push(joinMarks([D1], [])); // we removed D2
    waiting[0]!.resolve(stale(1, [D2, D3])); // it removed D1, kept D2, added D3
    await tick();
    // D1: we kept it, it removed it, we did not touch it - gone.
    // D2: we removed it - gone, though the other device kept it.
    expect(requests[1]).toEqual({ baseRev: 1, yes: [D3], maybe: [] });
  });

  it('lets us win a day both changed', async () => {
    const { queue, waiting, requests } = scripted({ marks: new Map() });
    queue.push(joinMarks([D1], []));
    waiting[0]!.resolve(stale(1, [], [D1]));
    await tick();
    expect(requests[1]).toEqual({ baseRev: 1, yes: [D1], maybe: [] });
  });

  it('keeps our empty selection from wiping marks of the other device on other days', async () => {
    const { queue, waiting, requests } = scripted({
      marks: joinMarks([D1], []),
    });
    queue.push(new Map()); // we cleared D1
    waiting[0]!.resolve(stale(1, [D1, D2]));
    await tick();
    expect(requests[1]).toEqual({ baseRev: 1, yes: [D2], maybe: [] });
  });

  it('rebases a newer state pushed meanwhile as well', async () => {
    const { queue, waiting, requests } = scripted({ marks: new Map() });
    queue.push(joinMarks([D1], []));
    queue.push(joinMarks([D1, D4], [])); // pending while the first is out
    waiting[0]!.resolve(stale(2, [D2]));
    await tick();
    expect(requests[1]).toEqual({ baseRev: 2, yes: [D1, D2, D4], maybe: [] });
  });

  it('sends the whole local set while the server marks are not known', async () => {
    const { queue, waiting, requests } = scripted();
    queue.push(joinMarks([D1], []));
    waiting[0]!.resolve(stale(1, [D2]));
    await tick();
    // No starting marks were given: nothing to tell our changes from theirs.
    expect(requests[1]).toEqual({ baseRev: 1, yes: [D1], maybe: [] });
  });

  it('takes the first answer as the starting point, so later conflicts merge', async () => {
    const { queue, waiting, requests } = scripted();
    queue.push(joinMarks([D1], []));
    waiting[0]!.resolve({ ok: true, rev: 1 });
    await tick();
    queue.push(joinMarks([D1, D3], []));
    waiting[1]!.resolve(stale(2, [D1, D2]));
    await tick();
    expect(requests[2]).toEqual({ baseRev: 2, yes: [D1, D2, D3], maybe: [] });
  });

  it('does not tell the screen about a merge when something newer is on it', async () => {
    const { queue, waiting, merged } = scripted({ marks: new Map() });
    queue.push(joinMarks([D1], []));
    waiting[0]!.resolve(stale(1, [D2]));
    await tick();
    queue.push(joinMarks([D1, D3], [])); // painted while the resend is out
    waiting[1]!.resolve({ ok: true, rev: 2 });
    await tick();
    expect(merged).toEqual([]);
  });

  it('does not tell the screen when nothing joined', async () => {
    const { queue, waiting, merged } = scripted({ marks: new Map() });
    queue.push(joinMarks([D1], []));
    waiting[0]!.resolve({ ok: true, rev: 1 });
    await tick();
    expect(merged).toEqual([]);
  });

  it('ignores server marks older than the newest known', async () => {
    const { queue, waiting, requests } = scripted({ marks: new Map() });
    queue.push(joinMarks([D1], []));
    waiting[0]!.resolve(stale(5, [D2]));
    await tick();
    waiting[1]!.resolve({ ok: true, rev: 6 });
    await tick();
    // A late, older refusal must not bring the server's older marks back.
    queue.push(joinMarks([D1, D2, D3], [])); // the screen took D2 in
    waiting[2]!.resolve(stale(4, [D4]));
    await tick();
    expect(requests[3]!.yes).toEqual([D1, D2, D3]);
  });

  it('adopt takes the server marks as the new starting point, only when idle', async () => {
    const { queue, waiting, requests } = scripted({ marks: new Map() });
    queue.adopt(3, joinMarks([D2], []));
    expect(queue.baseRev).toBe(3);
    queue.push(joinMarks([D2, D3], [])); // the screen showed D2 after adopting
    waiting[0]!.resolve(stale(4, [D2, D4]));
    await tick();
    // D2 was already there when adopted: not our change, but it is kept.
    expect(requests[1]).toEqual({ baseRev: 4, yes: [D2, D3, D4], maybe: [] });
  });

  it('adopt does nothing while a save is under way', () => {
    const { queue } = scripted({ marks: new Map() });
    queue.push(joinMarks([D1], []));
    queue.adopt(9, new Map());
    expect(queue.baseRev).toBe(0);
  });

  it("does not turn our own mark into someone else's when an answer was lost", async () => {
    const { queue, waiting, requests } = scripted({ marks: new Map() });
    queue.push(joinMarks([D1], []));
    waiting[0]!.reject(new Error('timed out')); // it landed, the answer did not
    await tick();
    queue.push(joinMarks([D2], [])); // meanwhile the screen moved on to D2
    waiting[1]!.resolve(stale(1, [D1]));
    await tick();
    expect(requests[2]).toEqual({ baseRev: 1, yes: [D2], maybe: [] });
  });
});

describe('SaveQueue, random schedules with a second device', () => {
  it("ends with the screen's last state plus what the other device kept", async () => {
    const days = [D1, D2, D3, D4];
    const wrong: string[] = [];
    for (let seed = 1; seed <= 300; seed += 1) {
      const random = generator(seed);
      const server = new FakeServer();
      const timers = new FakeTimers();
      const queue = new SaveQueue({
        baseRev: 0,
        marks: new Map(),
        onMerged: (merged) => {
          screen = new Map(merged);
        },
        send: server.send,
        timers,
      });
      let screen = new Map<string, 'yes' | 'maybe'>();
      const theirs = new Set<string>();
      for (let step = 0; step < 4 + Math.floor(random() * 20); step += 1) {
        const roll = random();
        if (roll < 0.35) {
          const day = days[Math.floor(random() * 2)]!; // ours: D1, D2
          screen = new Map(screen);
          if (screen.has(day)) screen.delete(day);
          else screen.set(day, 'yes');
          queue.push(screen);
        } else if (roll < 0.5) {
          // The other device marks D3 or D4 at once, on the server.
          const day = days[2 + Math.floor(random() * 2)]!;
          theirs.add(day);
          server.rev += 1;
          server.marks = {
            yes: [...new Set([...server.marks.yes, day])].sort(),
            maybe: server.marks.maybe,
          };
        } else if (server.open > 0) {
          server.answer();
        }
        await drain();
      }
      for (
        let guard = 0;
        guard < 100 && (server.open > 0 || timers.pending.length > 0);
        guard += 1
      ) {
        if (server.open > 0) server.answer();
        else timers.runNext();
        await drain();
      }
      const expected = [...new Set([...screen.keys(), ...theirs])].sort();
      if (
        queue.busy ||
        JSON.stringify(server.marks.yes) !== JSON.stringify(expected)
      )
        wrong.push(
          `seed ${seed}: server ${JSON.stringify(server.marks.yes)}, expected ${JSON.stringify(expected)}`
        );
    }
    expect(wrong).toEqual([]);
  });

  it('ends with the last state pushed, whatever the order of arrivals, losses and leave requests', async () => {
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
