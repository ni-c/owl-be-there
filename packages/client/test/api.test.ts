import { EventSnapshot } from '@owl/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  ApiFailure,
  calendarFileUrl,
  NetworkFailure,
  REQUEST_TIMEOUT_MS,
  streamUrl,
} from '../src/lib/api.ts';
import { EVENT_ID, eventSnapshot, jsonResponse } from './browser.ts';

const PID = 'Kd8mQ3vNp2Ra';

function mockFetch(...responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift()!;
      if (next instanceof Error) throw next;
      return next;
    })
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the event snapshot fixture', () => {
  it('is a valid snapshot, at the version asked for and at 3 by default', () => {
    expect(EventSnapshot.parse(eventSnapshot(7)).event.version).toBe(7);
    expect(EventSnapshot.parse(eventSnapshot()).event.version).toBe(3);
  });
});

describe('api', () => {
  it('creates an event with a JSON body', async () => {
    const calls = mockFetch(
      jsonResponse(201, { id: EVENT_ID, adminToken: 'a'.repeat(43) })
    );
    const result = await api.createEvent({
      title: 'T',
      emoji: 'owl',
      language: 'en',
      durationDays: 1,
      days: ['2027-03-06'],
    });
    expect(result.id).toBe(EVENT_ID);
    expect(calls[0]!.url).toBe('/api/events');
    expect(calls[0]!.init.method).toBe('POST');
    expect(
      (calls[0]!.init.headers as Record<string, string>)['content-type']
    ).toBe('application/json');
  });

  it('reads an event with its ETag, and answers null when it has not changed', async () => {
    const calls = mockFetch(
      jsonResponse(200, eventSnapshot(), { etag: '"v3"' }),
      jsonResponse(304, null)
    );
    const first = await api.getEvent(EVENT_ID, null);
    expect(first).toMatchObject({
      etag: '"v3"',
      data: { event: { version: 3 } },
    });
    expect(await api.getEvent(EVENT_ID, '"v3"')).toBeNull();
    expect(
      (calls[1]!.init.headers as Record<string, string>)['if-none-match']
    ).toBe('"v3"');
  });

  it('turns an error body into an ApiFailure with its code', async () => {
    mockFetch(
      jsonResponse(404, { error: 'not_found', message: 'No such event' })
    );
    await expect(api.getEvent(EVENT_ID, null)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'No such event',
    });
  });

  it('copes with an error that is not JSON', async () => {
    mockFetch(
      new Response('<html>Bad gateway</html>', {
        status: 502,
        statusText: 'Bad Gateway',
      })
    );
    const failure = await api.instance().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiFailure);
    expect(failure).toMatchObject({ status: 502, code: 'http_502' });
  });

  it('reports a network failure as such', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    await expect(api.instance()).rejects.toBeInstanceOf(NetworkFailure);
  });

  it('sends the participant token and leaves out an empty password', async () => {
    const calls = mockFetch(
      jsonResponse(200, { participantId: PID, token: 't', created: true })
    );
    await api.session(EVENT_ID, 'Max', '');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ name: 'Max' });
    const marks = mockFetch(jsonResponse(200, { rev: 1, version: 4 }));
    const result = await api.putMarks(
      EVENT_ID,
      PID,
      { baseRev: 0, yes: [], maybe: [] },
      { participant: 'tok' },
      true
    );
    expect(result).toEqual({ ok: true, rev: 1, version: 4 });
    expect(
      (marks[0]!.init.headers as Record<string, string>)['x-participant-token']
    ).toBe('tok');
    expect(marks[0]!.init.keepalive).toBe(true);
  });

  it('returns a stale save as an answer, and a closed poll as a failure', async () => {
    mockFetch(
      jsonResponse(409, {
        error: 'stale',
        rev: 2,
        yes: ['2027-03-06'],
        maybe: [],
      }),
      jsonResponse(409, { error: 'closed', message: 'The poll is closed' }),
      jsonResponse(403, { error: 'forbidden' })
    );
    expect(
      await api.putMarks(EVENT_ID, PID, { baseRev: 0, yes: [], maybe: [] }, {})
    ).toEqual({ ok: false, rev: 2 });
    await expect(
      api.putMarks(EVENT_ID, PID, { baseRev: 0, yes: [], maybe: [] }, {})
    ).rejects.toMatchObject({ code: 'closed' });
    await expect(
      api.putMarks(EVENT_ID, PID, { baseRev: 0, yes: [], maybe: [] }, {})
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('sends the organiser key for every organiser call', async () => {
    const calls = mockFetch(
      jsonResponse(200, eventSnapshot()),
      jsonResponse(200, eventSnapshot()),
      jsonResponse(200, eventSnapshot()),
      new Response(null, { status: 204 }),
      jsonResponse(200, {
        participant: {
          id: PID,
          name: 'M',
          note: null,
          source: 'self',
          answered: false,
          hasPassword: false,
          rev: 0,
          yes: [],
          maybe: [],
          unseen: [],
        },
        token: null,
      }),
      new Response(null, { status: 204 })
    );
    await api.updateEvent(EVENT_ID, { title: 'X' }, 'adm');
    await api.setStatus(EVENT_ID, { status: 'closed' }, 'adm');
    await api.addRoster(EVENT_ID, ['A'], 'adm');
    await api.deleteEvent(EVENT_ID, 'adm');
    await api.updateParticipant(
      EVENT_ID,
      PID,
      { password: null },
      { admin: 'adm' }
    );
    await api.deleteParticipant(EVENT_ID, PID, { admin: 'adm' });
    for (const call of calls) {
      expect(
        (call.init.headers as Record<string, string>)['x-admin-token']
      ).toBe('adm');
    }
    expect(calls.map((c) => c.init.method)).toEqual([
      'PATCH',
      'PUT',
      'POST',
      'DELETE',
      'PATCH',
      'DELETE',
    ]);
  });

  it('fails a delete that the server refuses', async () => {
    mockFetch(jsonResponse(403, { error: 'forbidden' }));
    await expect(api.deleteEvent(EVENT_ID, 'wrong')).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('builds the calendar and stream links', () => {
    expect(calendarFileUrl(EVENT_ID)).toBe(
      `/api/events/${EVENT_ID}/calendar.ics`
    );
    expect(streamUrl(EVENT_ID)).toBe(`/api/events/${EVENT_ID}/stream`);
  });

  describe('failures in the answer', () => {
    const body = { baseRev: 0, yes: [], maybe: [] };

    /** A 200 whose body breaks off after the headers, as a dropped link does. */
    const brokenBody = (status = 200): Response =>
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.error(new TypeError('terminated'));
          },
        }),
        { status, headers: { 'content-type': 'application/json' } }
      );

    it('calls a body that breaks off a network failure', async () => {
      mockFetch(brokenBody(), brokenBody(), brokenBody());
      await expect(
        api.putMarks(EVENT_ID, PID, body, { participant: 't' })
      ).rejects.toBeInstanceOf(NetworkFailure);
      await expect(api.instance()).rejects.toBeInstanceOf(NetworkFailure);
      await expect(api.getEvent(EVENT_ID, null)).rejects.toBeInstanceOf(
        NetworkFailure
      );
    });

    it('calls a 200 that is not JSON a bad answer worth retrying', async () => {
      mockFetch(
        new Response('<html>Sign in to the Wi-Fi</html>', { status: 200 }),
        new Response('<html>Sign in to the Wi-Fi</html>', { status: 200 })
      );
      await expect(
        api.putMarks(EVENT_ID, PID, body, { participant: 't' })
      ).rejects.toMatchObject({ status: 502, code: 'bad_response' });
      await expect(api.instance()).rejects.toMatchObject({
        status: 502,
        code: 'bad_response',
      });
    });

    it('calls a 409 that is not JSON retryable, not unknown', async () => {
      mockFetch(new Response('conflict', { status: 409 }));
      const failure = await api
        .putMarks(EVENT_ID, PID, body, { participant: 't' })
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ApiFailure);
      expect(failure).toMatchObject({ status: 502, code: 'bad_response' });
    });

    it('keeps a 200 that is JSON but the wrong shape out of the network failures', async () => {
      mockFetch(jsonResponse(200, { nope: true }));
      const failure = await api.instance().catch((error: unknown) => error);
      expect(failure).not.toBeInstanceOf(NetworkFailure);
      expect(failure).not.toBeInstanceOf(ApiFailure);
    });

    it('still answers an error whose body breaks off with its status', async () => {
      mockFetch(brokenBody(503));
      await expect(api.instance()).rejects.toMatchObject({
        status: 503,
        code: 'http_503',
      });
    });
  });

  describe('deadline', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** A fetch that never answers, and gives up when its signal fires. */
    function stalledFetch() {
      const signals: AbortSignal[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              signals.push(init.signal!);
              init.signal!.addEventListener('abort', () =>
                reject(new DOMException('aborted', 'AbortError'))
              );
            })
        )
      );
      return signals;
    }

    it('gives up on a request that never answers, as a network failure', async () => {
      vi.useFakeTimers();
      const signals = stalledFetch();
      const result = api.instance().catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
      expect(signals[0]!.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await result).toBeInstanceOf(NetworkFailure);
      expect(signals[0]!.aborted).toBe(true);
    });

    it('applies the deadline to saves, keepalive ones included', async () => {
      vi.useFakeTimers();
      const signals = stalledFetch();
      const result = api
        .putMarks(
          EVENT_ID,
          PID,
          { baseRev: 0, yes: [], maybe: [] },
          { participant: 't' },
          true
        )
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
      expect(await result).toBeInstanceOf(NetworkFailure);
      expect(signals).toHaveLength(1);
    });

    it('gives up on a body that never ends, too', async () => {
      vi.useFakeTimers();
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) => {
          const stream = new ReadableStream({
            start(controller) {
              init.signal!.addEventListener('abort', () =>
                controller.error(new DOMException('aborted', 'AbortError'))
              );
            },
          });
          return new Response(stream, { status: 200 });
        })
      );
      const result = api.instance().catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
      expect(await result).toBeInstanceOf(NetworkFailure);
    });

    it('lets an answer that arrives just before the deadline through', async () => {
      vi.useFakeTimers();
      vi.stubGlobal(
        'fetch',
        vi.fn(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve(jsonResponse(200, eventSnapshot(), { etag: '"v3"' })),
                REQUEST_TIMEOUT_MS - 1
              )
            )
        )
      );
      const result = api.getEvent(EVENT_ID, null);
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
      expect(await result).toMatchObject({ etag: '"v3"' });
    });

    it('stops the clock once the answer is in', async () => {
      vi.useFakeTimers();
      mockFetch(jsonResponse(200, eventSnapshot()));
      await api.getEvent(EVENT_ID, null);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('stops the clock after a failure, too', async () => {
      vi.useFakeTimers();
      mockFetch(new TypeError('Failed to fetch'));
      await api.instance().catch(() => undefined);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
