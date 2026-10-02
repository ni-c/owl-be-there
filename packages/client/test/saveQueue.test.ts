import { joinMarks, type Marks } from '@owl/shared';
import { describe, expect, it } from 'vitest';
import {
  marksOf,
  PermanentSaveError,
  RETRY_DELAYS_MS,
  SaveQueue,
  type SaveRequest,
  type SaveStatus,
  type SendResult,
  type Timers,
} from '../src/lib/saveQueue.ts';

/** A send function whose answers the test hands out one by one. */
class FakeServer {
  rev = 0;
  marks = { yes: [] as string[], maybe: [] as string[] };
  readonly requests: SaveRequest[] = [];
  private readonly waiting: {
    request: SaveRequest;
    resolve(r: SendResult): void;
    reject(e: unknown): void;
  }[] = [];

  send = (request: SaveRequest): Promise<SendResult> => {
    this.requests.push(request);
    return new Promise((resolve, reject) =>
      this.waiting.push({ request, resolve, reject })
    );
  };

  /** Answer the oldest open request the way the real server would. */
  answer(): void {
    const next = this.waiting.shift()!;
    if (next.request.baseRev !== this.rev) {
      next.resolve({ ok: false, rev: this.rev, ...this.marks });
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
    expect(queue.currentStatus).toBe('saved');
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
    queue.flushOnLeave(); // in flight already: the pending one waits
    expect(sent).toHaveLength(1);
  });

  it('sends with keepalive when nothing is in flight', () => {
    const sent: boolean[] = [];
    const queue = new SaveQueue({
      baseRev: 0,
      send: (_request, keepalive) => {
        sent.push(keepalive);
        return Promise.reject(new Error('gone'));
      },
    });
    // Reach a state with something pending and nothing in flight.
    (queue as unknown as { pending: Marks }).pending = marks('2027-03-06');
    queue.flushOnLeave();
    expect(sent).toEqual([true]);
    expect(queue.busy).toBe(false);
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

  it('turns lists back into marks', () => {
    expect(marksOf(['2027-03-06'], ['2027-03-07']).get('2027-03-07')).toBe(
      'maybe'
    );
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
});
