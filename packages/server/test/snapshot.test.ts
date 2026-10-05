import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import {
  buildSnapshot,
  deleteEvent,
  getEvent,
  snapshot,
} from '../src/db/repo.js';
import {
  createEvent,
  eventBody,
  getSnapshot,
  join,
  mark,
  testApp,
  WEEKEND,
  type TestApp,
  adminHeaders,
  setStatus,
} from './helpers.js';

let t: TestApp;
beforeEach(async () => {
  t = await testApp();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await t.app.close();
});

const DAYS = ['2027-03-05', ...WEEKEND];

/** What the database holds now, read without the cache. */
const fresh = (id: string) => buildSnapshot(t.db, getEvent(t.db, id)!);

describe('the snapshot cache', () => {
  it('hands out the same object while the event is unchanged', async () => {
    const { id } = await createEvent(t.app);
    const first = snapshot(t.db, id)!;
    expect(snapshot(t.db, id)).toBe(first);
    expect(first).toEqual(fresh(id));
    // Reads through the API change nothing.
    await getSnapshot(t.app, id);
    await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(snapshot(t.db, id)).toBe(first);
  });

  it('answers null for an unknown event', () => {
    expect(snapshot(t.db, 'AAAAAAAAAAAA')).toBeNull();
    expect(snapshot(t.db, 'AAAAAAAAAAAA')).toBeNull();
  });

  describe('moves on after every kind of write', () => {
    const writers: [
      string,
      (ctx: {
        id: string;
        adminToken: string;
        max: { participantId: string; token: string };
        ana: { participantId: string; token: string };
      }) => Promise<{ statusCode: number }>,
    ][] = [
      [
        'saving marks',
        ({ id, ana }) => mark(t.app, id, ana, ['2027-03-06'], ['2027-03-07']),
      ],
      [
        'renaming a participant',
        ({ id, max }) =>
          t.app.inject({
            method: 'PATCH',
            url: `/api/events/${id}/participants/${max.participantId}`,
            headers: { 'x-participant-token': max.token },
            payload: { name: 'Maximilian' },
          }),
      ],
      [
        'a note',
        ({ id, max }) =>
          t.app.inject({
            method: 'PATCH',
            url: `/api/events/${id}/participants/${max.participantId}`,
            headers: { 'x-participant-token': max.token },
            payload: { note: 'late' },
          }),
      ],
      [
        'a password',
        ({ id, max }) =>
          t.app.inject({
            method: 'PATCH',
            url: `/api/events/${id}/participants/${max.participantId}`,
            headers: { 'x-participant-token': max.token },
            payload: { password: 'secret1' },
          }),
      ],
      [
        'adding to the roster',
        ({ id, adminToken }) =>
          t.app.inject({
            method: 'POST',
            url: `/api/events/${id}/participants`,
            headers: adminHeaders(adminToken),
            payload: { names: ['Zoe'] },
          }),
      ],
      [
        'removing a participant',
        ({ id, max }) =>
          t.app.inject({
            method: 'DELETE',
            url: `/api/events/${id}/participants/${max.participantId}`,
            headers: { 'x-participant-token': max.token },
          }),
      ],
      [
        'editing the details',
        ({ id, adminToken }) =>
          t.app.inject({
            method: 'PATCH',
            url: `/api/events/${id}`,
            headers: adminHeaders(adminToken),
            payload: { title: 'Winter tournament' },
          }),
      ],
      [
        'editing the days, which takes marks along',
        ({ id, adminToken }) =>
          t.app.inject({
            method: 'PATCH',
            url: `/api/events/${id}`,
            headers: adminHeaders(adminToken),
            payload: { days: WEEKEND, baseDays: DAYS },
          }),
      ],
      [
        'closing',
        ({ id, adminToken }) =>
          setStatus(t.app, id, adminToken, { status: 'closed' }),
      ],
      [
        'finalizing',
        ({ id, adminToken }) =>
          setStatus(t.app, id, adminToken, {
            status: 'finalized',
            start: '2027-03-06',
          }),
      ],
    ];

    it.each(writers)('%s', async (_name, write) => {
      const { id, adminToken } = await createEvent(t.app, {
        durationDays: 1,
      });
      const max = await join(t.app, id, 'Max');
      const ana = await join(t.app, id, 'Ana');
      await mark(t.app, id, max, ['2027-03-05', '2027-03-06']);
      const before = snapshot(t.db, id)!;
      const response = await write({ id, adminToken, max, ana });
      expect(response.statusCode).toBeLessThan(300);
      const after = snapshot(t.db, id)!;
      expect(after).not.toBe(before);
      expect(after.event.version).toBeGreaterThan(before.event.version);
      expect(after).toEqual(fresh(id));
      expect(await getSnapshot(t.app, id)).toEqual(
        JSON.parse(JSON.stringify(after))
      );
    });

    it('reopening', async () => {
      const { id, adminToken } = await createEvent(t.app);
      const put = (status: string) =>
        setStatus(t.app, id, adminToken, { status });
      await put('closed');
      const closed = snapshot(t.db, id)!;
      expect(closed.event.status).toBe('closed');
      await put('open');
      const reopened = snapshot(t.db, id)!;
      expect(reopened).not.toBe(closed);
      expect(reopened.event.status).toBe('open');
      expect(reopened).toEqual(fresh(id));
    });
  });

  it('follows a participant from marks to none and back', async () => {
    const { id } = await createEvent(t.app);
    const max = await join(t.app, id, 'Max');
    expect(snapshot(t.db, id)!.participants[0]).toMatchObject({
      answered: false,
      yes: [],
    });
    await mark(t.app, id, max, WEEKEND, [], 0);
    const marked = snapshot(t.db, id)!;
    expect(marked.participants[0]!.yes).toEqual(WEEKEND);
    await mark(t.app, id, max, [], [], 1);
    const empty = snapshot(t.db, id)!;
    expect(empty).not.toBe(marked);
    expect(empty.participants[0]).toMatchObject({
      answered: true,
      yes: [],
      maybe: [],
    });
    await mark(t.app, id, max, ['2027-03-05'], [], 2);
    expect(snapshot(t.db, id)!.participants[0]!.yes).toEqual(['2027-03-05']);
  });

  it('handles an event with no participants and no marks', async () => {
    const { id } = await createEvent(t.app, eventBody({ roster: [] }));
    const data = snapshot(t.db, id)!;
    expect(data.participants).toEqual([]);
    expect(snapshot(t.db, id)).toBe(data);
  });

  it('never answers for an event that is gone, even at a cached version', async () => {
    const { id } = await createEvent(t.app);
    const data = snapshot(t.db, id)!;
    expect(snapshot(t.db, id)).toBe(data);
    expect(deleteEvent(t.db, id)).toBe(true);
    expect(snapshot(t.db, id)).toBeNull();
    // The same through the routes.
    const again = await createEvent(t.app);
    snapshot(t.db, again.id);
    const gone = await t.app.inject({
      method: 'DELETE',
      url: `/api/events/${again.id}`,
      headers: adminHeaders(again.adminToken),
    });
    expect(gone.statusCode).toBe(204);
    for (const url of [
      `/api/events/${again.id}`,
      `/e/${again.id}`,
      `/e/${again.id}/og.png`,
    ]) {
      const response = await t.app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(404);
    }
  });

  it('does not keep what was read inside a transaction that rolled back', async () => {
    const { id } = await createEvent(t.app);
    const max = await join(t.app, id, 'Max');
    const committed = snapshot(t.db, id)!;
    expect(() =>
      t.db.tx(() => {
        t.db.run(
          'UPDATE events SET version = version + 1, title = ? WHERE id = ?',
          'Uncommitted',
          id
        );
        expect(snapshot(t.db, id)!.event.title).toBe('Uncommitted');
        throw new Error('roll back');
      })
    ).toThrow('roll back');
    // The rolled-back state left nothing behind: the next write reuses the
    // version number, and must not be answered with the discarded title.
    await mark(t.app, id, max, WEEKEND);
    const after = snapshot(t.db, id)!;
    expect(after.event.title).toBe(committed.event.title);
    expect(after).toEqual(fresh(id));
  });

  it('keeps the latest snapshots, dropping the least recently used', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 32; i += 1) ids.push((await createEvent(t.app)).id);
    const held = ids.map((id) => snapshot(t.db, id)!);
    // All 32 fit; touching the first makes the second the oldest.
    expect(snapshot(t.db, ids[0]!)).toBe(held[0]);
    const extra = (await createEvent(t.app)).id;
    snapshot(t.db, extra);
    expect(snapshot(t.db, ids[0]!)).toBe(held[0]);
    expect(snapshot(t.db, ids[2]!)).toBe(held[2]);
    const rebuilt = snapshot(t.db, ids[1]!)!;
    expect(rebuilt).not.toBe(held[1]);
    expect(rebuilt).toEqual(held[1]);
  });

  it('keeps events of different databases apart', async () => {
    const other = await testApp();
    try {
      const { id } = await createEvent(t.app);
      const mine = snapshot(t.db, id)!;
      expect(snapshot(other.db, id)).toBeNull();
      expect(snapshot(t.db, id)).toBe(mine);
    } finally {
      await other.app.close();
    }
  });
});

describe('reads on the routes', () => {
  it('draw the page and the picture from the cached snapshot', async () => {
    const { id } = await createEvent(t.app);
    const max = await join(t.app, id, 'Max');
    await mark(t.app, id, max, WEEKEND);
    const get = (url: string) => t.app.inject({ method: 'GET', url });
    expect((await get(`/e/${id}/og.png`)).statusCode).toBe(200);
    expect((await get(`/e/${id}`)).statusCode).toBe(200);
    // A hit reads the event row and nothing else: no participants, no marks.
    const all = vi.spyOn(t.db, 'all');
    for (let i = 0; i < 5; i += 1) {
      expect((await get(`/e/${id}/og.png`)).statusCode).toBe(200);
      expect((await get(`/e/${id}`)).statusCode).toBe(200);
      expect((await get(`/api/events/${id}`)).statusCode).toBe(200);
    }
    expect(all).not.toHaveBeenCalled();
  });

  it('show a change at once', async () => {
    const { id } = await createEvent(t.app);
    const max = await join(t.app, id, 'Max');
    const before = (
      await t.app.inject({ method: 'GET', url: `/e/${id}/og.png` })
    ).rawPayload;
    await mark(t.app, id, max, WEEKEND);
    expect((await getSnapshot(t.app, id)).participants[0].yes).toEqual(WEEKEND);
    const after = (
      await t.app.inject({ method: 'GET', url: `/e/${id}/og.png` })
    ).rawPayload;
    expect(after.equals(before)).toBe(false);
  });

  it('answer 404 for an unknown id and for a trailing slash', async () => {
    for (const url of [
      '/e/AAAAAAAAAAAA',
      '/e/AAAAAAAAAAAA/og.png',
      '/e/AAAAAAAAAAAA/',
      '/e/nope',
    ]) {
      const response = await t.app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(404);
    }
  });
});
