import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  ApiFailure,
  calendarFileUrl,
  NetworkFailure,
  streamUrl,
} from '../src/lib/api.ts';
import { jsonResponse } from './browser.ts';

const ID = '7gT4kPq2Wx9Z';
const PID = 'Kd8mQ3vNp2Ra';

const snapshot = {
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
    version: 3,
    days: ['2027-03-06'],
  },
  participants: [],
};

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

describe('api', () => {
  it('creates an event with a JSON body', async () => {
    const calls = mockFetch(
      jsonResponse(201, { id: ID, adminToken: 'a'.repeat(43) })
    );
    const result = await api.createEvent({
      title: 'T',
      emoji: 'owl',
      language: 'en',
      durationDays: 1,
      days: ['2027-03-06'],
    });
    expect(result.id).toBe(ID);
    expect(calls[0]!.url).toBe('/api/events');
    expect(calls[0]!.init.method).toBe('POST');
    expect(
      (calls[0]!.init.headers as Record<string, string>)['content-type']
    ).toBe('application/json');
  });

  it('reads an event with its ETag, and answers null when it has not changed', async () => {
    const calls = mockFetch(
      jsonResponse(200, snapshot, { etag: '"v3"' }),
      jsonResponse(304, null)
    );
    const first = await api.getEvent(ID, null);
    expect(first).toMatchObject({
      etag: '"v3"',
      data: { event: { version: 3 } },
    });
    expect(await api.getEvent(ID, '"v3"')).toBeNull();
    expect(
      (calls[1]!.init.headers as Record<string, string>)['if-none-match']
    ).toBe('"v3"');
  });

  it('turns an error body into an ApiFailure with its code', async () => {
    mockFetch(
      jsonResponse(404, { error: 'not_found', message: 'No such event' })
    );
    await expect(api.getEvent(ID, null)).rejects.toMatchObject({
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
    await api.session(ID, 'Max', '');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ name: 'Max' });
    const marks = mockFetch(jsonResponse(200, { rev: 1, version: 4 }));
    const result = await api.putMarks(
      ID,
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
      await api.putMarks(ID, PID, { baseRev: 0, yes: [], maybe: [] }, {})
    ).toEqual({
      ok: false,
      rev: 2,
      yes: ['2027-03-06'],
      maybe: [],
    });
    await expect(
      api.putMarks(ID, PID, { baseRev: 0, yes: [], maybe: [] }, {})
    ).rejects.toMatchObject({ code: 'closed' });
    await expect(
      api.putMarks(ID, PID, { baseRev: 0, yes: [], maybe: [] }, {})
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('sends the organiser key for every organiser call', async () => {
    const calls = mockFetch(
      jsonResponse(200, snapshot),
      jsonResponse(200, snapshot),
      jsonResponse(200, snapshot),
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
    await api.updateEvent(ID, { title: 'X' }, 'adm');
    await api.setStatus(ID, { status: 'closed' }, 'adm');
    await api.addRoster(ID, ['A'], 'adm');
    await api.deleteEvent(ID, 'adm');
    await api.updateParticipant(ID, PID, { password: null }, { admin: 'adm' });
    await api.deleteParticipant(ID, PID, { admin: 'adm' });
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
    await expect(api.deleteEvent(ID, 'wrong')).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('builds the calendar and stream links', () => {
    expect(calendarFileUrl(ID)).toBe(`/api/events/${ID}/calendar.ics`);
    expect(streamUrl(ID)).toBe(`/api/events/${ID}/stream`);
  });
});
