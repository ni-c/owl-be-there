import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIMITS, snapshotEtag } from '@owl/shared';
import { getEvent } from '../src/db/repo.js';
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
  patchEvent,
} from './helpers.js';

let t: TestApp;
beforeEach(async () => {
  t = await testApp();
});
afterEach(async () => {
  await t.app.close();
});

describe('creating an event', () => {
  it('answers with the id and the organiser key, and stores everything', async () => {
    const { id, adminToken } = await createEvent(t.app, {
      description: 'Bring a ball',
      location: 'North field',
      creatorName: 'Willi',
      minCount: 4,
      roster: ['Anna', 'Ben', 'anna'],
    });
    expect(id).toMatch(/^[1-9A-HJ-NP-Za-km-z]{12}$/);
    expect(adminToken).toMatch(/^[\w-]{43}$/);
    const { event, participants } = await getSnapshot(t.app, id);
    expect(event).toMatchObject({
      title: 'Summer tournament',
      description: 'Bring a ball',
      location: 'North field',
      creatorName: 'Willi',
      emoji: 'soccer',
      minCount: 4,
      status: 'open',
      days: ['2027-03-05', ...WEEKEND],
      version: 1,
      expiresOn: '2027-05-30',
    });
    // The roster is deduplicated by name key, and nobody on it has answered.
    expect(participants.map((p: { name: string }) => p.name)).toEqual([
      'Anna',
      'Ben',
    ]);
    expect(participants.every((p: { answered: boolean }) => !p.answered)).toBe(
      true
    );
  });

  it('stores blank optional texts as nothing', async () => {
    const { id } = await createEvent(t.app, {
      description: '   ',
      location: '',
      creatorName: ' ',
    });
    const { event } = await getSnapshot(t.app, id);
    expect([event.description, event.location, event.creatorName]).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('sorts the days and drops duplicates', async () => {
    const { id } = await createEvent(t.app, {
      days: ['2027-03-07', '2027-03-06', '2027-03-07'],
    });
    expect((await getSnapshot(t.app, id)).event.days).toEqual(WEEKEND);
  });

  it('refuses days in the past, beyond the span, or too many', async () => {
    const post = (days: string[]) =>
      t.app.inject({
        method: 'POST',
        url: '/api/events',
        payload: eventBody({ days }),
      });
    const past = await post(['2027-02-27']);
    expect(past.statusCode).toBe(400);
    expect(past.json()).toMatchObject({
      error: 'invalid_days',
      message: 'past',
    });
    // Yesterday in UTC is still allowed: it is today somewhere.
    expect((await post(['2027-02-28'])).statusCode).toBe(201);
    expect((await post(['2027-03-01', '2028-03-02'])).json().message).toBe(
      'span'
    );
  });

  it('refuses a duration no run of candidate days can hold', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/events',
      payload: eventBody({
        days: ['2027-03-05', '2027-03-07'],
        durationDays: 2,
      }),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('no_block');
  });

  it('refuses a malformed body with the problems named', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { title: 'x' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('validation_failed');
    expect(response.json().issues.length).toBeGreaterThan(0);
  });

  it('stops taking events when switched off or full', async () => {
    const off = await testApp({ env: { CREATION_ENABLED: 'false' } });
    const response = await off.app.inject({
      method: 'POST',
      url: '/api/events',
      payload: eventBody(),
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe('creation_disabled');
    await off.app.close();

    const small = await testApp({ env: { MAX_EVENTS: '1' } });
    await createEvent(small.app);
    const full = await small.app.inject({
      method: 'POST',
      url: '/api/events',
      payload: eventBody(),
    });
    expect(full.statusCode).toBe(503);
    expect(full.json().error).toBe('capacity');
    await small.app.close();
  });
});

describe('reading an event', () => {
  it('answers 404 for an unknown or malformed id', async () => {
    for (const id of ['AAAAAAAAAAAA', 'nope', '0OIl00000000']) {
      const response = await t.app.inject({
        method: 'GET',
        url: `/api/events/${id}`,
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('not_found');
    }
  });

  it('answers 304 while nothing changed', async () => {
    const { id } = await createEvent(t.app);
    const first = await t.app.inject({
      method: 'GET',
      url: `/api/events/${id}`,
    });
    expect(first.headers.etag).toBe('"v1"');
    expect(first.headers['cache-control']).toBe('private, no-cache');
    const again = await t.app.inject({
      method: 'GET',
      url: `/api/events/${id}`,
      headers: { 'if-none-match': '"v1"' },
    });
    expect(again.statusCode).toBe(304);
    await join(t.app, id, 'Max');
    const changed = await t.app.inject({
      method: 'GET',
      url: `/api/events/${id}`,
      headers: { 'if-none-match': '"v1"' },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.headers.etag).toBe('"v2"');
  });

  it('sends the shared ETag for the event version, and answers 304 only to that one', async () => {
    const { id } = await createEvent(t.app);
    await join(t.app, id, 'Max');
    const version = getEvent(t.db, id)!.version;
    expect(version).toBeGreaterThan(1);
    const get = (etag: string) =>
      t.app.inject({
        method: 'GET',
        url: `/api/events/${id}`,
        headers: { 'if-none-match': etag },
      });
    const same = await get(snapshotEtag(version));
    expect(same.statusCode).toBe(304);
    expect(same.headers.etag).toBe(snapshotEtag(version));
    const older = await get(snapshotEtag(version - 1));
    expect(older.statusCode).toBe(200);
    expect(older.headers.etag).toBe(snapshotEtag(version));
    const newer = await get(snapshotEtag(version + 1));
    expect(newer.statusCode).toBe(200);
  });

  it.each([
    ['a weak validator', 'W/"v1"'],
    ['a list', '"v0", "v1"'],
    ['a weak validator in a list', '"v0",W/"v1"'],
    ['a star', '*'],
  ])('answers 304 to %s', async (_name, value) => {
    const { id } = await createEvent(t.app);
    const response = await t.app.inject({
      method: 'GET',
      url: `/api/events/${id}`,
      headers: { 'if-none-match': value },
    });
    expect(response.statusCode).toBe(304);
  });

  it.each(['', '"v2"', 'W/"v2", "v0"', '"v1x"', 'v1'])(
    'answers 200 to the If-None-Match value %j',
    async (value) => {
      const { id } = await createEvent(t.app);
      const response = await t.app.inject({
        method: 'GET',
        url: `/api/events/${id}`,
        headers: { 'if-none-match': value },
      });
      expect(response.statusCode).toBe(200);
    }
  );

  it('never extends an event by reading it', async () => {
    const { id } = await createEvent(t.app);
    const before = getEvent(t.db, id)!;
    t.clock.advanceDays(30);
    await t.app.inject({ method: 'GET', url: `/api/events/${id}` });
    await t.app.inject({ method: 'GET', url: `/e/${id}` });
    const after = getEvent(t.db, id)!;
    expect(after.last_write_at).toBe(before.last_write_at);
    expect(after.expires_on).toBe(before.expires_on);
  });
});

describe('the organiser', () => {
  it('needs the key for every change', async () => {
    const { id } = await createEvent(t.app);
    const requests = [
      {
        method: 'PATCH' as const,
        url: `/api/events/${id}`,
        payload: { title: 'x' },
      },
      {
        method: 'PUT' as const,
        url: `/api/events/${id}/status`,
        payload: { status: 'closed' },
      },
      {
        method: 'POST' as const,
        url: `/api/events/${id}/participants`,
        payload: { names: ['A'] },
      },
      { method: 'DELETE' as const, url: `/api/events/${id}` },
    ];
    for (const request of requests) {
      for (const headers of [{}, adminHeaders('wrong')]) {
        const response = await t.app.inject({ ...request, headers });
        expect(response.statusCode, `${request.method} ${request.url}`).toBe(
          403
        );
        expect(response.json().error).toBe('forbidden');
      }
    }
  });

  it('leaves version and retention alone when a PATCH changes nothing', async () => {
    const { id, adminToken } = await createEvent(t.app, { title: 'Same' });
    const before = getEvent(t.db, id)!;
    t.clock.advanceDays(30);
    const snapshot = await getSnapshot(t.app, id);
    for (const payload of [
      {},
      { title: 'Same' },
      {
        days: [...snapshot.event.days].reverse(),
        baseDays: snapshot.event.days,
      },
    ]) {
      expect(
        (await patchEvent(t.app, id, adminToken, payload)).statusCode
      ).toBe(200);
      const after = getEvent(t.db, id)!;
      expect(after.version).toBe(before.version);
      expect(after.last_write_at).toBe(before.last_write_at);
      expect(after.expires_on).toBe(before.expires_on);
    }
    expect(
      (await patchEvent(t.app, id, adminToken, { title: 'Other' })).statusCode
    ).toBe(200);
    const changed = getEvent(t.db, id)!;
    expect(changed.version).toBe(before.version + 1);
    expect(changed.expires_on).not.toBe(before.expires_on);
  });

  it('edits the details and clears optional ones', async () => {
    const { id, adminToken } = await createEvent(t.app, {
      location: 'North field',
    });
    const response = await patchEvent(t.app, id, adminToken, {
      title: ' New title ',
      location: null,
      emoji: 'tennis',
      minCount: 3,
      creatorName: 'Sam',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().event).toMatchObject({
      title: 'New title',
      location: null,
      emoji: 'tennis',
      minCount: 3,
      creatorName: 'Sam',
      version: 2,
    });
  });

  it('removes days with their marks and marks added days as new for those who answered', async () => {
    const { id, adminToken } = await createEvent(t.app);
    const max = await join(t.app, id, 'Max');
    expect((await mark(t.app, id, max, WEEKEND)).statusCode).toBe(200);
    t.clock.time += 1000;
    const response = await patchEvent(t.app, id, adminToken, {
      days: ['2027-03-06', '2027-03-08'],
      baseDays: ['2027-03-05', ...WEEKEND],
    });
    expect(response.statusCode).toBe(200);
    const participant = response.json().participants[0];
    expect(participant.yes).toEqual(['2027-03-06']);
    expect(participant.unseen).toEqual(['2027-03-08']);
  });

  it('keeps past days but refuses new ones in the past', async () => {
    const { id, adminToken } = await createEvent(t.app);
    t.clock.advanceDays(10);
    const keep = await patchEvent(t.app, id, adminToken, {
      days: ['2027-03-05', '2027-03-20'],
      baseDays: ['2027-03-05', ...WEEKEND],
    });
    expect(keep.statusCode).toBe(200);
    const add = await patchEvent(t.app, id, adminToken, {
      days: ['2027-03-05', '2027-03-06', '2027-03-20'],
      baseDays: ['2027-03-05', '2027-03-20'],
    });
    expect(add.statusCode).toBe(400);
    expect(add.json().message).toBe('past');
  });

  it('refuses a duration the days cannot hold', async () => {
    const { id, adminToken } = await createEvent(t.app);
    const response = await patchEvent(t.app, id, adminToken, {
      durationDays: 4,
    });
    expect(response.json().error).toBe('no_block');
  });

  it('closes, chooses a date, and reopens', async () => {
    const { id, adminToken } = await createEvent(t.app, { durationDays: 2 });
    expect(
      (await setStatus(t.app, id, adminToken, { status: 'closed' })).json()
        .event.status
    ).toBe('closed');
    const bad = await setStatus(t.app, id, adminToken, {
      status: 'finalized',
      start: '2027-03-07',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe('invalid_block');
    const chosen = (
      await setStatus(t.app, id, adminToken, {
        status: 'finalized',
        start: '2027-03-06',
      })
    ).json().event;
    expect(chosen).toMatchObject({
      status: 'finalized',
      finalStart: '2027-03-06',
      finalEnd: '2027-03-07',
    });
    expect(
      (await setStatus(t.app, id, adminToken, { status: 'open' })).json().event
    ).toMatchObject({
      status: 'open',
      finalStart: null,
    });
  });

  it('drops a chosen date that no longer fits after an edit, keeping the poll closed', async () => {
    const { id, adminToken } = await createEvent(t.app);
    await setStatus(t.app, id, adminToken, {
      status: 'finalized',
      start: '2027-03-07',
    });
    const response = await patchEvent(t.app, id, adminToken, {
      days: ['2027-03-05', '2027-03-06'],
      baseDays: ['2027-03-05', ...WEEKEND],
    });
    expect(response.json().event).toMatchObject({
      status: 'closed',
      finalStart: null,
    });
  });

  it('adds names to the list, skipping those already there, up to the limit', async () => {
    const { id, adminToken } = await createEvent(t.app, { roster: ['Anna'] });
    const response = await t.app.inject({
      method: 'POST',
      url: `/api/events/${id}/participants`,
      headers: adminHeaders(adminToken),
      payload: { names: ['ANNA', 'Ben'] },
    });
    expect(
      response.json().participants.map((p: { name: string }) => p.name)
    ).toEqual(['Anna', 'Ben']);
    const tooMany = await t.app.inject({
      method: 'POST',
      url: `/api/events/${id}/participants`,
      headers: adminHeaders(adminToken),
      payload: {
        names: Array.from(
          { length: LIMITS.participants - 1 },
          (_, i) => `P${i}`
        ),
      },
    });
    expect(tooMany.statusCode).toBe(409);
    expect(tooMany.json().error).toBe('full');
  });

  describe('against the limit of people', () => {
    const names = (count: number, prefix = 'P') =>
      Array.from({ length: count }, (_, i) => `${prefix}${i}`);
    const add = (id: string, token: string, list: string[]) =>
      t.app.inject({
        method: 'POST',
        url: `/api/events/${id}/participants`,
        headers: adminHeaders(token),
        payload: { names: list },
      });
    const count = async (id: string) =>
      (await getSnapshot(t.app, id)).participants.length;

    it('takes a list that fills the event exactly, and refuses one more name after it', async () => {
      const { id, adminToken } = await createEvent(t.app, {
        roster: names(LIMITS.participants - 2),
      });
      const fills = await add(id, adminToken, ['Last 1', 'Last 2']);
      expect(fills.statusCode).toBe(200);
      expect(await count(id)).toBe(LIMITS.participants);
      const over = await add(id, adminToken, ['One more']);
      expect(over.statusCode).toBe(409);
      expect(over.json().error).toBe('full');
      expect(await count(id)).toBe(LIMITS.participants);
    });

    it('refuses a list that crosses the limit by one name, and adds none of it', async () => {
      const { id, adminToken } = await createEvent(t.app, {
        roster: names(LIMITS.participants - 2),
      });
      const crosses = await add(id, adminToken, ['Fits', 'Fits too', 'Over']);
      expect(crosses.statusCode).toBe(409);
      expect(crosses.json().error).toBe('full');
      expect(await count(id)).toBe(LIMITS.participants - 2);
    });

    it('adds nothing for names that are there already, even in a full event', async () => {
      const { id, adminToken } = await createEvent(t.app, {
        roster: names(LIMITS.participants),
      });
      expect(await count(id)).toBe(LIMITS.participants);
      // Another spelling of a name that is there counts as that name.
      const again = await add(id, adminToken, ['P0', ' p1 ']);
      expect(again.statusCode).toBe(200);
      expect(await count(id)).toBe(LIMITS.participants);
      // One new name among them is one too many.
      const mixed = await add(id, adminToken, ['P0', 'Newcomer']);
      expect(mixed.statusCode).toBe(409);
      expect(await count(id)).toBe(LIMITS.participants);
    });

    it('does not take an empty list', async () => {
      const { id, adminToken } = await createEvent(t.app);
      const empty = await add(id, adminToken, []);
      expect(empty.statusCode).toBe(400);
      expect(empty.json().error).toBe('validation_failed');
    });

    it('gives the one answer a full event always gives, whoever asks', async () => {
      const { id, adminToken } = await createEvent(t.app, {
        roster: names(LIMITS.participants),
      });
      const byList = await add(id, adminToken, ['Newcomer']);
      const bySession = await t.app.inject({
        method: 'POST',
        url: `/api/events/${id}/session`,
        payload: { name: 'Newcomer' },
      });
      expect(byList.statusCode).toBe(409);
      expect(bySession.statusCode).toBe(409);
      expect(byList.json()).toEqual(bySession.json());
      expect(byList.json().error).toBe('full');
    });
  });

  it('deletes the event and everything in it', async () => {
    const { id, adminToken } = await createEvent(t.app);
    const max = await join(t.app, id, 'Max');
    await mark(t.app, id, max, WEEKEND);
    const response = await t.app.inject({
      method: 'DELETE',
      url: `/api/events/${id}`,
      headers: adminHeaders(adminToken),
    });
    expect(response.statusCode).toBe(204);
    expect(
      (await t.app.inject({ method: 'GET', url: `/api/events/${id}` }))
        .statusCode
    ).toBe(404);
    expect(t.db.all('SELECT * FROM marks')).toEqual([]);
    expect(t.db.all('SELECT * FROM participants')).toEqual([]);
  });
});

describe('the calendar file', () => {
  it('exists only once a date is chosen', async () => {
    const { id, adminToken } = await createEvent(t.app, {
      location: 'North field',
    });
    const before = await t.app.inject({
      method: 'GET',
      url: `/api/events/${id}/calendar.ics`,
    });
    expect(before.statusCode).toBe(404);
    expect(before.json().error).toBe('not_decided');
    await setStatus(t.app, id, adminToken, {
      status: 'finalized',
      start: '2027-03-06',
    });
    const file = await t.app.inject({
      method: 'GET',
      url: `/api/events/${id}/calendar.ics`,
    });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(file.headers['content-disposition']).toContain('attachment');
    expect(file.body).toContain('DTSTART;VALUE=DATE:20270306');
    expect(file.body).toContain('LOCATION:North field');
    expect(file.body).toContain(`URL:https://owl.example.org/e/${id}`);
  });

  it('uses the event language for its note', async () => {
    for (const [language, note] of [
      ['es', 'Fecha elegida con Owl Be There'],
      ['fr', 'Date choisie avec Owl Be There'],
      ['pt', 'Data definida com o Owl Be There'],
      ['it', 'Data scelta con Owl Be There'],
      ['ja', 'Owl Be Thereで決めた日程'],
      ['nl', 'Datum gekozen met Owl Be There'],
    ]) {
      const { id, adminToken } = await createEvent(t.app, { language });
      await setStatus(t.app, id, adminToken, {
        status: 'finalized',
        start: '2027-03-06',
      });
      const file = await t.app.inject({
        method: 'GET',
        url: `/api/events/${id}/calendar.ics`,
      });
      expect(file.statusCode).toBe(200);
      expect(file.body).toContain(`DESCRIPTION:${note}`);
    }
  });
});
