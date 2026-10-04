import { addDays, LIMITS } from '@owl/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/passwords.js';
import { insertParticipant } from '../src/db/repo.js';
import { HourlyCeiling } from '../src/routes/events.js';
import {
  createEvent,
  getSnapshot,
  join,
  mark,
  testApp,
  WEEKEND,
  type TestApp,
} from './helpers.js';

const DAYS = ['2027-03-05', ...WEEKEND];
const TODAY = '2027-03-01';

let t: TestApp;
beforeEach(async () => {
  t = await testApp();
});
afterEach(async () => {
  await t.app.close();
});

const admin = (token: string) => ({ 'x-admin-token': token });

const patch = (id: string, token: string, payload: Record<string, unknown>) =>
  t.app.inject({
    method: 'PATCH',
    url: `/api/events/${id}`,
    headers: admin(token),
    payload,
  });

const session = (id: string, payload: Record<string, unknown>) =>
  t.app.inject({ method: 'POST', url: `/api/events/${id}/session`, payload });

describe('editing the days', () => {
  it('needs the days the edit started from', async () => {
    const { id, adminToken } = await createEvent(t.app);
    const without = await patch(id, adminToken, { days: WEEKEND });
    expect(without.statusCode).toBe(400);
    expect(without.json().issues[0].path).toBe('baseDays');
  });

  it('accepts the base in any order and refuses one that is out of date', async () => {
    const { id, adminToken } = await createEvent(t.app);
    const reversed = [...DAYS].reverse();
    expect(
      (await patch(id, adminToken, { days: WEEKEND, baseDays: reversed }))
        .statusCode
    ).toBe(200);
    // A second tab still holds the three days it loaded.
    const stale = await patch(id, adminToken, {
      days: ['2027-03-05'],
      baseDays: DAYS,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toBe('days_changed');
    expect((await getSnapshot(t.app, id)).event.days).toEqual(WEEKEND);
  });

  it('leaves details alone without a base', async () => {
    const { id, adminToken } = await createEvent(t.app);
    expect((await patch(id, adminToken, { title: 'Renamed' })).statusCode).toBe(
      200
    );
  });

  it('gives a new revision to exactly those who lose marks', async () => {
    const { id, adminToken } = await createEvent(t.app);
    const max = await join(t.app, id, 'Max');
    const ann = await join(t.app, id, 'Ann');
    await join(t.app, id, 'Bob');
    await mark(t.app, id, max, WEEKEND);
    await mark(t.app, id, ann, ['2027-03-05']);
    const before = await getSnapshot(t.app, id);
    const rev = (snapshot: typeof before, name: string) =>
      snapshot.participants.find((p: { name: string }) => p.name === name)!
        .rev as number;

    await patch(id, adminToken, {
      days: ['2027-03-05', '2027-03-06'],
      baseDays: DAYS,
    });
    const after = await getSnapshot(t.app, id);
    expect(rev(after, 'Max')).toBe(rev(before, 'Max') + 1);
    expect(rev(after, 'Ann')).toBe(rev(before, 'Ann'));
    expect(rev(after, 'Bob')).toBe(rev(before, 'Bob'));
    // Max's next save, based on the new revision and without the lost day,
    // goes through.
    expect(
      (await mark(t.app, id, max, ['2027-03-06'], [], rev(after, 'Max')))
        .statusCode
    ).toBe(200);
  });
});

describe('a chosen date and a new duration', () => {
  const finalize = (id: string, token: string, start: string) =>
    t.app.inject({
      method: 'PUT',
      url: `/api/events/${id}/status`,
      headers: admin(token),
      payload: { status: 'finalized', start },
    });

  it('moves the end with the duration while the block still fits', async () => {
    const { id, adminToken } = await createEvent(t.app);
    await finalize(id, adminToken, '2027-03-06');
    const longer = await patch(id, adminToken, { durationDays: 2 });
    expect(longer.json().event).toMatchObject({
      status: 'finalized',
      finalStart: '2027-03-06',
      finalEnd: '2027-03-07',
    });
    const shorter = await patch(id, adminToken, { durationDays: 1 });
    expect(shorter.json().event).toMatchObject({
      finalStart: '2027-03-06',
      finalEnd: '2027-03-06',
    });
    // The same duration again changes nothing.
    const same = await patch(id, adminToken, { durationDays: 1 });
    expect(same.json().event.finalEnd).toBe('2027-03-06');
  });

  it('drops the date once the block no longer fits', async () => {
    const { id, adminToken } = await createEvent(t.app);
    await finalize(id, adminToken, '2027-03-06');
    const response = await patch(id, adminToken, { durationDays: 3 });
    expect(response.json().event).toMatchObject({
      status: 'closed',
      finalStart: null,
      finalEnd: null,
    });
  });
});

describe('how far ahead days may lie', () => {
  const last = addDays(TODAY, LIMITS.horizon);

  it('takes the last day of the horizon and refuses the day after', async () => {
    const ok = await t.app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        title: 'Far',
        emoji: 'owl',
        language: 'en',
        durationDays: 1,
        days: [last],
      },
    });
    expect(ok.statusCode).toBe(201);
    const far = await t.app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        title: 'Too far',
        emoji: 'owl',
        language: 'en',
        durationDays: 1,
        days: [addDays(last, 1)],
      },
    });
    expect(far.statusCode).toBe(400);
    expect(far.json().message).toBe('too_far');
  });

  it('refuses the last possible date outright', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        title: 'End of time',
        emoji: 'owl',
        language: 'en',
        durationDays: 1,
        days: ['9999-12-31'],
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses a far day added by an edit', async () => {
    const { id, adminToken } = await createEvent(t.app);
    // Within one span of the first day, but the clock has run on.
    t.clock.advanceDays(-LIMITS.horizon);
    const response = await patch(id, adminToken, {
      days: [...DAYS, '2027-03-08'],
      baseDays: DAYS,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe('too_far');
  });
});

describe('the organiser list', () => {
  const add = (id: string, token: string, names: string[]) =>
    t.app.inject({
      method: 'POST',
      url: `/api/events/${id}/participants`,
      headers: admin(token),
      payload: { names },
    });
  const names = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => `P${from + i}`);

  it('counts only the names that are new', async () => {
    const { id, adminToken } = await createEvent(t.app);
    expect((await add(id, adminToken, names(1, 140))).statusCode).toBe(200);
    // 15 of these are there already; 5 are new — 145 in all.
    expect((await add(id, adminToken, names(126, 145))).statusCode).toBe(200);
    expect((await getSnapshot(t.app, id)).participants).toHaveLength(145);
    // 6 new ones would make 151.
    const over = await add(id, adminToken, names(140, 151));
    expect(over.statusCode).toBe(409);
    expect(over.json().error).toBe('full');
    // Exactly to the limit is fine.
    expect((await add(id, adminToken, names(141, 150))).statusCode).toBe(200);
  });
});

describe('checking an organiser key', () => {
  it('answers 204 for the key and 403 for anything else', async () => {
    const { id, adminToken } = await createEvent(t.app);
    const check = (token?: string) =>
      t.app.inject({
        method: 'GET',
        url: `/api/events/${id}/admin`,
        ...(token !== undefined && { headers: admin(token) }),
      });
    expect((await check(adminToken)).statusCode).toBe(204);
    expect((await check('A'.repeat(43))).statusCode).toBe(403);
    expect((await check()).statusCode).toBe(403);
  });

  it('is a 404 for an event that does not exist', async () => {
    const response = await t.app.inject({
      method: 'GET',
      url: '/api/events/AAAAAAAAAAAA/admin',
      headers: admin('x'.repeat(43)),
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('guessing passwords', () => {
  it('makes a name wait after five wrong passwords, and the wait ends', async () => {
    const { id } = await createEvent(t.app);
    await join(t.app, id, 'Max', 'secret-1');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await session(id, { name: 'Max', password: 'guess' });
      expect(wrong.json().error).toBe('wrong_password');
    }
    // Now even the right password has to wait.
    const waiting = await session(id, { name: 'max', password: 'secret-1' });
    expect(waiting.statusCode).toBe(429);
    expect(waiting.json().error).toBe('slow_down');
    t.clock.time += 30_000;
    const right = await session(id, { name: 'Max', password: 'secret-1' });
    expect(right.statusCode).toBe(200);
    // Getting it right starts the count afresh.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await session(id, { name: 'Max', password: 'guess' });
    }
    expect(
      (await session(id, { name: 'Max', password: 'secret-1' })).statusCode
    ).toBe(200);
  });

  it('doubles the wait with every further miss', async () => {
    const { id } = await createEvent(t.app);
    await join(t.app, id, 'Max', 'secret-1');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await session(id, { name: 'Max', password: 'guess' });
    }
    t.clock.time += 30_000;
    // The sixth miss: the next wait is a minute.
    await session(id, { name: 'Max', password: 'guess' });
    t.clock.time += 30_000;
    expect(
      (await session(id, { name: 'Max', password: 'secret-1' })).statusCode
    ).toBe(429);
    t.clock.time += 30_000;
    expect(
      (await session(id, { name: 'Max', password: 'secret-1' })).statusCode
    ).toBe(200);
  });

  it('does not hold up other names or other events', async () => {
    const { id } = await createEvent(t.app);
    const other = await createEvent(t.app);
    await join(t.app, id, 'Max', 'secret-1');
    await join(t.app, id, 'Ann', 'secret-2');
    await join(t.app, other.id, 'Max', 'secret-3');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await session(id, { name: 'Max', password: 'guess' });
    }
    expect(
      (await session(id, { name: 'Ann', password: 'secret-2' })).statusCode
    ).toBe(200);
    expect(
      (await session(other.id, { name: 'Max', password: 'secret-3' }))
        .statusCode
    ).toBe(200);
  });
});

describe('password length', () => {
  it('needs six characters for a new password', async () => {
    const { id } = await createEvent(t.app);
    const short = await session(id, { name: 'Max', password: 'abcde' });
    expect(short.statusCode).toBe(400);
    expect(short.json().error).toBe('password_too_short');
    expect(short.json().message).toContain(String(LIMITS.passwordMin));
    expect(
      (await session(id, { name: 'Max', password: 'abcdef' })).statusCode
    ).toBe(200);
  });

  it('still lets in someone whose older password is shorter', async () => {
    const { id } = await createEvent(t.app);
    insertParticipant(
      t.db,
      id,
      {
        id: 'Legacy123456',
        name: 'Old',
        nameKey: 'old',
        passwordHash: await hashPassword('abcd'),
      },
      t.clock.now()
    );
    expect(
      (await session(id, { name: 'Old', password: 'abcd' })).statusCode
    ).toBe(200);
  });
});

describe('two requests for one name at once', () => {
  it('creates the name once and tells the other it is taken', async () => {
    const { id } = await createEvent(t.app);
    const [a, b] = await Promise.all([
      session(id, { name: 'Max', password: 'secret-1' }),
      session(id, { name: 'max', password: 'secret-2' }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect([a, b].find((r) => r.statusCode === 409)!.json().error).toBe(
      'name_taken'
    );
    expect((await getSnapshot(t.app, id)).participants).toHaveLength(1);
  });

  it('lets only one of two first passwords protect a name', async () => {
    const { id } = await createEvent(t.app);
    await join(t.app, id, 'Max');
    const [a, b] = await Promise.all([
      session(id, { name: 'Max', password: 'secret-1' }),
      session(id, { name: 'Max', password: 'secret-2' }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const winner = a.statusCode === 200 ? 'secret-1' : 'secret-2';
    expect(
      (await session(id, { name: 'Max', password: winner })).statusCode
    ).toBe(200);
  });
});

describe('the link preview page', () => {
  it('names the address without its query in a 404', async () => {
    const response = await t.app.inject({
      method: 'GET',
      url: '/e/AAAAAAAAAAAA?utm=x',
    });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('utm=x');
  });

  it('does not serve dotfiles', async () => {
    // The fixture holds one; served, it would answer 200.
    const response = await t.app.inject({ method: 'GET', url: '/.hidden' });
    expect(response.statusCode).not.toBe(200);
    expect(response.body).not.toContain('SECRET');
  });
});

describe('the hourly ceiling on new events', () => {
  it('gives one network at most a tenth', () => {
    const ceiling = new HourlyCeiling();
    for (let n = 0; n < 30; n += 1) {
      expect(ceiling.allow(0, 300, 'a')).toBe(true);
    }
    expect(ceiling.allow(0, 300, 'a')).toBe(false);
    expect(ceiling.allow(0, 300, 'b')).toBe(true);
  });

  it('stops everyone at the ceiling and starts afresh after an hour', () => {
    const ceiling = new HourlyCeiling();
    for (let n = 0; n < 10; n += 1) {
      expect(ceiling.allow(0, 10, `net${n}`)).toBe(true);
    }
    expect(ceiling.allow(0, 10, 'late')).toBe(false);
    expect(ceiling.allow(3_600_000, 10, 'late')).toBe(true);
  });

  it('allows each network one even under a tiny ceiling', () => {
    const ceiling = new HourlyCeiling();
    expect(ceiling.allow(0, 5, 'a')).toBe(true);
    expect(ceiling.allow(0, 5, 'a')).toBe(false);
  });
});
