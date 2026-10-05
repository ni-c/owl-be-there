import { describe, expect, it, vi } from 'vitest';
import { ApiFailure, NetworkFailure } from '../src/lib/api.ts';
import { marksSender } from '../src/lib/marksSender.ts';
import {
  PermanentSaveError,
  SaveQueue,
  type SaveRequest,
  type SaveStatus,
  type SendResult,
  type Timers,
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
      refresh: () => undefined,
    });
    await send(
      request(['2027-03-01', '2027-03-02'], ['2027-03-03', '2027-03-04']),
      true
    );
    expect(put).toHaveBeenCalledWith(
      { baseRev: 3, yes: ['2027-03-02'], maybe: ['2027-03-04'] },
      true
    );
  });

  it('keeps an empty request empty and reads the candidates per request', async () => {
    const put = vi.fn().mockResolvedValue(ok);
    let days = new Set<string>();
    const send = marksSender({
      put,
      candidates: () => days,
      refresh: () => undefined,
    });
    await send(request([]), false);
    expect(put).toHaveBeenLastCalledWith(request([]), false);
    // Every day removed: the marks that remain are none.
    await send(request(['2027-03-01']), false);
    expect(put).toHaveBeenLastCalledWith(request([]), false);
    days = new Set(['2027-03-01']);
    await send(request(['2027-03-01']), false);
    expect(put).toHaveBeenLastCalledWith(request(['2027-03-01']), false);
  });

  it('passes a refused write on as a retry and fetches the snapshot', async () => {
    const refresh = vi.fn();
    const refused = failure(400, 'invalid_marks');
    const send = marksSender({
      put: () => Promise.reject(refused),
      candidates: () => new Set(['2027-03-01']),
      refresh,
    });
    await expect(send(request(['2027-03-01']), false)).rejects.toBe(refused);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('retries network errors, throttling and server errors, and no more', async () => {
    const outcomes = [
      [new NetworkFailure(new Error('offline')), false],
      [failure(429, 'rate_limited'), false],
      [failure(503, 'unavailable'), false],
      [failure(403, 'forbidden'), true],
      [failure(400, 'bad_request'), true],
      [new Error('boom'), true],
    ] as const;
    for (const [error, permanent] of outcomes) {
      const send = marksSender({
        put: () => Promise.reject(error),
        candidates: () => new Set(),
        refresh: () => undefined,
      });
      const result = await send(request([]), false).catch((e: unknown) => e);
      if (permanent) expect(result).toBeInstanceOf(PermanentSaveError);
      else expect(result).toBe(error);
    }
  });

  it('reports the code of a permanent failure', async () => {
    const send = marksSender({
      put: () => Promise.reject(failure(403, 'forbidden')),
      candidates: () => new Set(),
      refresh: () => undefined,
    });
    await expect(send(request([]), false)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('saves the stroke after a stale candidate list, minus the removed day', async () => {
    // The first answer is the server's refusal, the second its acceptance.
    let removed = false;
    const sent: SaveRequest[] = [];
    const timers: Timers & { run(): void } = (() => {
      let task: (() => void) | null = null;
      return {
        setTimeout: (fn: () => void) => {
          task = fn;
          return 1;
        },
        clearTimeout: () => {
          task = null;
        },
        run: () => task?.(),
      };
    })();
    const statuses: SaveStatus[] = [];
    let candidates = new Set(['2027-03-01', '2027-03-02']);
    const send = marksSender({
      put: async (req) => {
        sent.push(req);
        // The server already knows the day is gone; the client does not.
        if (!removed) {
          removed = true;
          throw failure(400, 'invalid_marks');
        }
        return { ok: true, rev: 4 };
      },
      candidates: () => candidates,
      refresh: () => {
        candidates = new Set(['2027-03-02']);
      },
    });
    const queue = new SaveQueue({
      baseRev: 3,
      send,
      onStatus: (status) => statuses.push(status),
      timers,
    });
    queue.push(
      new Map([
        ['2027-03-01', 'yes'],
        ['2027-03-02', 'yes'],
      ])
    );
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('retrying'));
    timers.run();
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('saved'));
    expect(sent.map((r) => r.yes)).toEqual([
      ['2027-03-01', '2027-03-02'],
      ['2027-03-02'],
    ]);
  });
});
