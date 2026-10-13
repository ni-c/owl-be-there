import { addDays, LIMITS, MarksBody } from '@owl/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApiFailure, NetworkFailure } from '../src/lib/api.ts';
import { marksSender } from '../src/lib/marksSender.ts';
import {
  PermanentSaveError,
  SaveQueue,
  type SaveRequest,
  type SaveStatus,
  type SendResult,
} from '../src/lib/saveQueue.ts';

const request = (yes: string[], maybe: string[] = []): SaveRequest => ({
  baseRev: 3,
  yes,
  maybe,
});
const ok: SendResult = { ok: true, rev: 4 };
const failure = (status: number, code: string) =>
  new ApiFailure(status, code, code, null);

describe('marksSender', () => {
  it('sends only the days that are candidates now', async () => {
    const put = vi.fn().mockResolvedValue(ok);
    const send = marksSender({
      put,
      candidates: () => new Set(['2027-03-02', '2027-03-04']),
    });
    await send(
      request(['2027-03-01', '2027-03-02'], ['2027-03-03', '2027-03-04'])
    );
    expect(put).toHaveBeenCalledWith({
      baseRev: 3,
      yes: ['2027-03-02'],
      maybe: ['2027-03-04'],
      days: ['2027-03-02', '2027-03-04'],
    });
  });

  it('names every candidate day it knows, sorted, marked or not', async () => {
    const put = vi.fn().mockResolvedValue(ok);
    const send = marksSender({
      put,
      candidates: () =>
        new Set(['2027-03-09', '2027-03-01', '2027-03-05', '2027-03-03']),
    });
    await send(request(['2027-03-05']));
    expect(put).toHaveBeenLastCalledWith({
      baseRev: 3,
      yes: ['2027-03-05'],
      maybe: [],
      days: ['2027-03-01', '2027-03-03', '2027-03-05', '2027-03-09'],
    });
    // The first and the last day of the year are days like any other.
    const edges = marksSender({
      put,
      candidates: () => new Set(['2027-12-31', '2027-01-01']),
    });
    await edges(request([]));
    expect(put).toHaveBeenLastCalledWith({
      baseRev: 3,
      yes: [],
      maybe: [],
      days: ['2027-01-01', '2027-12-31'],
    });
  });

  it('sends an empty list, not none, when no day is a candidate', async () => {
    const put = vi.fn().mockResolvedValue(ok);
    const send = marksSender({ put, candidates: () => new Set() });
    await send(request(['2027-03-01'], ['2027-03-02']));
    const sent = put.mock.calls[0]![0] as SaveRequest;
    expect(sent).toEqual({ baseRev: 3, yes: [], maybe: [], days: [] });
    expect(Object.keys(sent)).toContain('days');
  });

  it('keeps the list of known days well inside the body limit of the server', async () => {
    // LIMITS.days days in all three lists is the largest save there can be.
    const all = Array.from({ length: LIMITS.days }, (_, i) =>
      addDays('2027-03-01', i)
    );
    const put = vi.fn().mockResolvedValue(ok);
    const send = marksSender({ put, candidates: () => new Set(all) });
    await send(request(all.slice(0, 100), all.slice(100)));
    const sent = put.mock.calls[0]![0] as SaveRequest;
    expect(sent.days).toEqual(all);
    expect(MarksBody.safeParse(sent).success).toBe(true);
    // The server refuses a body above 32 KiB.
    expect(JSON.stringify(sent).length).toBeLessThan(16 * 1024);
  });

  it('keeps an empty request empty and reads the candidates per request', async () => {
    const put = vi.fn().mockResolvedValue(ok);
    let days = new Set<string>();
    const send = marksSender({ put, candidates: () => days });
    await send(request([]));
    expect(put).toHaveBeenLastCalledWith({ ...request([]), days: [] });
    // Every day removed: the marks that remain are none.
    await send(request(['2027-03-01']));
    expect(put).toHaveBeenLastCalledWith({ ...request([]), days: [] });
    days = new Set(['2027-03-01']);
    await send(request(['2027-03-01']));
    expect(put).toHaveBeenLastCalledWith({
      ...request(['2027-03-01']),
      days: ['2027-03-01'],
    });
    // A day added meanwhile is named from the next request on.
    days = new Set(['2027-03-01', '2027-03-02']);
    await send(request(['2027-03-01']));
    expect(put).toHaveBeenLastCalledWith({
      ...request(['2027-03-01']),
      days: ['2027-03-01', '2027-03-02'],
    });
  });

  it('passes on what the server answered, a stale revision included', async () => {
    const answers: SendResult[] = [ok, { ok: false, rev: 7 }];
    for (const answer of answers) {
      const send = marksSender({
        put: () => Promise.resolve(answer),
        candidates: () => new Set(['2027-03-01']),
      });
      expect(await send(request(['2027-03-01']))).toEqual(answer);
    }
  });

  it('retries network errors, throttling and server errors, and no more', async () => {
    const outcomes = [
      [new NetworkFailure(new Error('offline')), false],
      [failure(429, 'rate_limited'), false],
      [failure(500, 'internal'), false],
      [failure(503, 'unavailable'), false],
      [failure(403, 'forbidden'), true],
      [failure(400, 'bad_request'), true],
      [failure(400, 'invalid_marks'), true],
      [failure(409, 'closed'), true],
      [failure(404, 'not_found'), true],
      [new Error('boom'), true],
    ] as const;
    for (const [error, permanent] of outcomes) {
      const send = marksSender({
        put: () => Promise.reject(error),
        candidates: () => new Set(),
      });
      const result = await send(request([])).catch((e: unknown) => e);
      if (permanent) expect(result).toBeInstanceOf(PermanentSaveError);
      else expect(result).toBe(error);
    }
  });

  it('reports the code of a permanent failure', async () => {
    for (const [error, code] of [
      [failure(403, 'forbidden'), 'forbidden'],
      [failure(400, 'invalid_marks'), 'invalid_marks'],
      [new Error('boom'), 'unknown'],
    ] as const) {
      const send = marksSender({
        put: () => Promise.reject(error),
        candidates: () => new Set(),
      });
      await expect(send(request([]))).rejects.toMatchObject({ code });
    }
  });

  it('stops the queue for good on a save the server calls invalid', async () => {
    const scheduled: (() => void)[] = [];
    const statuses: SaveStatus[] = [];
    let sent = 0;
    const queue = new SaveQueue({
      baseRev: 3,
      send: marksSender({
        put: () => {
          sent += 1;
          return Promise.reject(failure(400, 'invalid_marks'));
        },
        candidates: () => new Set(['2027-03-01']),
      }),
      onStatus: (status) => statuses.push(status),
      timers: {
        setTimeout: (fn) => scheduled.push(fn),
        clearTimeout: () => undefined,
      },
    });
    queue.push(new Map([['2027-03-01', 'yes']]));
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('failed'));
    // No retry and no loop: the refusal is a verdict on the marks.
    expect(scheduled).toEqual([]);
    expect(sent).toBe(1);
    expect(queue.busy).toBe(false);
  });

  it('saves the stroke after a stale revision, minus the day removed meanwhile', async () => {
    // The first answer is the server's 409, the second its acceptance. By the
    // time the queue sends again, the snapshot that removed the day is in.
    const sent: SaveRequest[] = [];
    const statuses: SaveStatus[] = [];
    let candidates = new Set(['2027-03-01', '2027-03-02']);
    const queue = new SaveQueue({
      baseRev: 3,
      send: marksSender({
        put: async (req) => {
          sent.push(req);
          if (sent.length > 1) return { ok: true, rev: 6 };
          candidates = new Set(['2027-03-02']);
          return { ok: false, rev: 5 };
        },
        candidates: () => candidates,
      }),
      onStatus: (status) => statuses.push(status),
    });
    queue.push(
      new Map([
        ['2027-03-01', 'yes'],
        ['2027-03-02', 'yes'],
      ])
    );
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('saved'));
    expect(sent).toEqual([
      {
        baseRev: 3,
        yes: ['2027-03-01', '2027-03-02'],
        maybe: [],
        days: ['2027-03-01', '2027-03-02'],
      },
      { baseRev: 5, yes: ['2027-03-02'], maybe: [], days: ['2027-03-02'] },
    ]);
    expect(queue.baseRev).toBe(6);
    expect(queue.busy).toBe(false);
  });

  it('names the days it knew when the stroke was sent, not the ones added after', async () => {
    // The page has not heard of 2027-03-03 yet: the save must not claim it.
    const sent: SaveRequest[] = [];
    let candidates = new Set(['2027-03-01', '2027-03-02']);
    const queue = new SaveQueue({
      baseRev: 0,
      send: marksSender({
        put: async (req) => {
          sent.push(req);
          return { ok: true, rev: sent.length };
        },
        candidates: () => candidates,
      }),
    });
    queue.push(new Map([['2027-03-01', 'yes']]));
    await vi.waitFor(() => expect(queue.busy).toBe(false));
    expect(sent[0]!.days).toEqual(['2027-03-01', '2027-03-02']);
    // The snapshot with the new day arrives; the next save names it.
    candidates = new Set(['2027-03-01', '2027-03-02', '2027-03-03']);
    queue.push(new Map([['2027-03-02', 'yes']]));
    await vi.waitFor(() => expect(queue.busy).toBe(false));
    expect(sent[1]).toEqual({
      baseRev: 1,
      yes: ['2027-03-02'],
      maybe: [],
      days: ['2027-03-01', '2027-03-02', '2027-03-03'],
    });
  });

  it('names the known days in a save sent as the page is left', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true, rev: 1 });
    const queue = new SaveQueue({
      baseRev: 0,
      send: marksSender({
        put,
        candidates: () => new Set(['2027-03-02', '2027-03-01']),
      }),
    });
    // Nothing pending: nothing goes out.
    queue.flushOnLeave();
    expect(put).not.toHaveBeenCalled();
    queue.push(new Map([['2027-03-01', 'maybe']]));
    queue.flushOnLeave();
    await vi.waitFor(() => expect(queue.busy).toBe(false));
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenLastCalledWith({
      baseRev: 0,
      yes: [],
      maybe: ['2027-03-01'],
      days: ['2027-03-01', '2027-03-02'],
    });
  });
});
