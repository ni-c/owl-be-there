import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createEvent,
  getSnapshot,
  join,
  mark,
  testApp,
  WEEKEND,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let id: string;
let adminToken: string;
beforeEach(async () => {
  t = await testApp();
  ({ id, adminToken } = await createEvent(t.app));
});
afterEach(async () => {
  await t.app.close();
});

const session = (payload: Record<string, unknown>) =>
  t.app.inject({ method: 'POST', url: `/api/events/${id}/session`, payload });

const close = () =>
  t.app.inject({
    method: 'PUT',
    url: `/api/events/${id}/status`,
    headers: { 'x-admin-token': adminToken },
    payload: { status: 'closed' },
  });

describe('who are you', () => {
  it('creates a participant for a new name, and finds them again by any spelling', async () => {
    const first = await join(t.app, id, 'Max');
    expect(first.created).toBe(true);
    const again = await join(t.app, id, ' MAX ');
    expect(again).toMatchObject({
      participantId: first.participantId,
      created: false,
    });
    // The same token on every device: signing in twice signs nobody out.
    expect(again.token).toBe(first.token);
  });

  it('protects a name with a password', async () => {
    await join(t.app, id, 'Max', 'secret-1');
    const without = await session({ name: 'Max' });
    expect(without.statusCode).toBe(401);
    expect(without.json().error).toBe('password_required');
    const wrong = await session({ name: 'Max', password: 'nope' });
    expect(wrong.json().error).toBe('wrong_password');
    expect(
      (await session({ name: 'max', password: 'secret-1' })).statusCode
    ).toBe(200);
  });

  it('lets someone protect an unprotected name, revoking older tokens', async () => {
    const before = await join(t.app, id, 'Max');
    const after = await join(t.app, id, 'Max', 'secret-1');
    expect(after.participantId).toBe(before.participantId);
    expect(after.token).not.toBe(before.token);
    expect((await mark(t.app, id, before, WEEKEND)).statusCode).toBe(403);
    expect((await mark(t.app, id, after, WEEKEND)).statusCode).toBe(200);
  });

  it('refuses passwords that are too short', async () => {
    expect((await session({ name: 'New', password: 'abc' })).json().error).toBe(
      'password_too_short'
    );
    await join(t.app, id, 'Max');
    expect((await session({ name: 'Max', password: 'abc' })).json().error).toBe(
      'password_too_short'
    );
  });

  it('lets roster names in without creating anyone', async () => {
    const roster = await createEvent(t.app, { roster: ['Anna'] });
    const anna = await join(t.app, roster.id, 'anna');
    expect(anna.created).toBe(false);
    expect((await getSnapshot(t.app, roster.id)).participants).toHaveLength(1);
  });

  it('lets known names in but takes no new ones once closed', async () => {
    await join(t.app, id, 'Max');
    await close();
    expect((await session({ name: 'Max' })).statusCode).toBe(200);
    const fresh = await session({ name: 'Newcomer' });
    expect(fresh.statusCode).toBe(409);
    expect(fresh.json().error).toBe('closed');
  });

  it('does not let a closed poll be used to protect a name', async () => {
    const max = await join(t.app, id, 'Max');
    await close();
    const response = await session({ name: 'Max', password: 'secret-1' });
    expect(response.json().token).toBe(max.token);
    expect((await getSnapshot(t.app, id)).participants[0].hasPassword).toBe(
      false
    );
  });
});

describe('marks', () => {
  it('saves yes and maybe, counting the person as answered', async () => {
    const max = await join(t.app, id, 'Max');
    const response = await mark(t.app, id, max, ['2027-03-06'], ['2027-03-07']);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ rev: 1, version: 3 });
    const person = (await getSnapshot(t.app, id)).participants[0];
    expect(person).toMatchObject({
      answered: true,
      yes: ['2027-03-06'],
      maybe: ['2027-03-07'],
      rev: 1,
    });
  });

  it('records "none of these days" as an answer', async () => {
    const max = await join(t.app, id, 'Max');
    expect((await mark(t.app, id, max, [])).statusCode).toBe(200);
    expect((await getSnapshot(t.app, id)).participants[0]).toMatchObject({
      answered: true,
      yes: [],
      maybe: [],
    });
  });

  it('refuses a save based on an old revision and hands back the current one', async () => {
    const max = await join(t.app, id, 'Max');
    await mark(t.app, id, max, ['2027-03-06'], [], 0);
    const late = await mark(t.app, id, max, ['2027-03-07'], [], 0);
    expect(late.statusCode).toBe(409);
    expect(late.json()).toEqual({
      error: 'stale',
      rev: 1,
      yes: ['2027-03-06'],
      maybe: [],
    });
    expect((await mark(t.app, id, max, ['2027-03-07'], [], 1)).statusCode).toBe(
      200
    );
  });

  it('refuses days that are not candidates, and a day marked twice', async () => {
    const max = await join(t.app, id, 'Max');
    expect((await mark(t.app, id, max, ['2027-03-09'])).json().error).toBe(
      'invalid_marks'
    );
    expect(
      (await mark(t.app, id, max, ['2027-03-06'], ['2027-03-06'])).json().error
    ).toBe('invalid_marks');
  });

  it('collapses repeated days', async () => {
    const max = await join(t.app, id, 'Max');
    expect(
      (await mark(t.app, id, max, ['2027-03-06', '2027-03-06'])).statusCode
    ).toBe(200);
  });

  it('accepts only the owner and the organiser', async () => {
    const max = await join(t.app, id, 'Max');
    const ana = await join(t.app, id, 'Ana');
    expect(
      (
        await mark(
          t.app,
          id,
          { participantId: max.participantId, token: ana.token },
          WEEKEND
        )
      ).statusCode
    ).toBe(403);
    expect(
      (
        await mark(
          t.app,
          id,
          { participantId: max.participantId, token: '' },
          WEEKEND
        )
      ).statusCode
    ).toBe(403);
    const byAdmin = await t.app.inject({
      method: 'PUT',
      url: `/api/events/${id}/participants/${max.participantId}/marks`,
      headers: { 'x-admin-token': adminToken },
      payload: { baseRev: 0, yes: WEEKEND, maybe: [] },
    });
    expect(byAdmin.statusCode).toBe(200);
  });

  it('is closed for participants, but not for the organiser, once the poll closes', async () => {
    const max = await join(t.app, id, 'Max');
    await close();
    const response = await mark(t.app, id, max, WEEKEND);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('closed');
  });

  it('answers 404 for an unknown participant', async () => {
    const response = await mark(
      t.app,
      id,
      { participantId: 'AAAAAAAAAAAA', token: 'x' },
      WEEKEND
    );
    expect(response.statusCode).toBe(404);
    const malformed = await mark(
      t.app,
      id,
      { participantId: 'bad', token: 'x' },
      WEEKEND
    );
    expect(malformed.statusCode).toBe(404);
  });
});

describe('changing a participant', () => {
  const patch = (
    pid: string,
    headers: Record<string, string>,
    payload: Record<string, unknown>
  ) =>
    t.app.inject({
      method: 'PATCH',
      url: `/api/events/${id}/participants/${pid}`,
      headers,
      payload,
    });

  it('renames, but not to a name someone else has', async () => {
    const max = await join(t.app, id, 'Max');
    await join(t.app, id, 'Ana');
    const taken = await patch(
      max.participantId,
      { 'x-participant-token': max.token },
      { name: 'ana' }
    );
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error).toBe('name_taken');
    const renamed = await patch(
      max.participantId,
      { 'x-participant-token': max.token },
      { name: 'Maximilian' }
    );
    expect(renamed.json().participant.name).toBe('Maximilian');
    // Renaming to another spelling of one's own name is fine.
    expect(
      (
        await patch(
          max.participantId,
          { 'x-participant-token': max.token },
          { name: 'MAXIMILIAN' }
        )
      ).statusCode
    ).toBe(200);
  });

  it('sets and clears the note', async () => {
    const max = await join(t.app, id, 'Max');
    const set = await patch(
      max.participantId,
      { 'x-participant-token': max.token },
      { note: 'only after 6 pm' }
    );
    expect(set.json().participant.note).toBe('only after 6 pm');
    const cleared = await patch(
      max.participantId,
      { 'x-participant-token': max.token },
      { note: '' }
    );
    expect(cleared.json().participant.note).toBeNull();
  });

  it('changes the password, handing the owner a new token and revoking the old', async () => {
    const max = await join(t.app, id, 'Max');
    const response = await patch(
      max.participantId,
      { 'x-participant-token': max.token },
      { password: 'secret-1' }
    );
    expect(response.json().participant.hasPassword).toBe(true);
    const fresh = response.json().token as string;
    expect(fresh).not.toBe(max.token);
    expect((await mark(t.app, id, max, WEEKEND)).statusCode).toBe(403);
    expect(
      (
        await mark(
          t.app,
          id,
          { participantId: max.participantId, token: fresh },
          WEEKEND
        )
      ).statusCode
    ).toBe(200);
  });

  it('lets the organiser reset a password without receiving a token', async () => {
    const max = await join(t.app, id, 'Max', 'secret-1');
    const response = await patch(
      max.participantId,
      { 'x-admin-token': adminToken },
      { password: null }
    );
    expect(response.json()).toMatchObject({
      participant: { hasPassword: false },
      token: null,
    });
    expect((await session({ name: 'Max' })).statusCode).toBe(200);
  });

  it('deletes an entry, by its owner or the organiser', async () => {
    const max = await join(t.app, id, 'Max');
    const ana = await join(t.app, id, 'Ana');
    const remove = (pid: string, headers: Record<string, string>) =>
      t.app.inject({
        method: 'DELETE',
        url: `/api/events/${id}/participants/${pid}`,
        headers,
      });
    expect(
      (await remove(max.participantId, { 'x-participant-token': ana.token }))
        .statusCode
    ).toBe(403);
    expect(
      (await remove(max.participantId, { 'x-participant-token': max.token }))
        .statusCode
    ).toBe(204);
    expect(
      (await remove(ana.participantId, { 'x-admin-token': adminToken }))
        .statusCode
    ).toBe(204);
    expect((await getSnapshot(t.app, id)).participants).toEqual([]);
  });
});

describe('tokens revoked while a password is hashed', () => {
  const patch = (
    pid: string,
    headers: Record<string, string>,
    payload: Record<string, unknown>
  ) =>
    t.app.inject({
      method: 'PATCH',
      url: `/api/events/${id}/participants/${pid}`,
      headers,
      payload,
    });

  it('no longer write: of two changes with one token only one wins', async () => {
    const max = await join(t.app, id, 'Max');
    const headers = { 'x-participant-token': max.token };
    const slow = patch(max.participantId, headers, { password: 'attacker-pw' });
    const clearing = patch(max.participantId, headers, { password: null });
    const [first, second] = await Promise.all([slow, clearing]);
    expect(first.statusCode).toBe(403);
    expect(second.statusCode).toBe(200);
    expect(first.json().error).toBe('forbidden');
    const view = (await getSnapshot(t.app, id)).participants.find(
      (p: { id: string }) => p.id === max.participantId
    );
    expect(view.hasPassword).toBe(false);
    // The token the winner was given is the one that works.
    expect(
      (await patch(max.participantId, headers, { note: 'x' })).statusCode
    ).toBe(403);
  });

  it('do not stop the organiser, whose key is no token', async () => {
    const max = await join(t.app, id, 'Max');
    const slow = patch(
      max.participantId,
      { 'x-admin-token': adminToken },
      { password: 'organiser-pw' }
    );
    const clearing = patch(
      max.participantId,
      { 'x-participant-token': max.token },
      { password: null }
    );
    const [first, second] = await Promise.all([slow, clearing]);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
  });

  it('give a login whose password was reset meanwhile a 409, never a dead token', async () => {
    await join(t.app, id, 'Ann', 'secret-1');
    const pid = (await getSnapshot(t.app, id)).participants[0].id as string;
    const [login, reset] = await Promise.all([
      session({ name: 'Ann', password: 'secret-1' }),
      patch(pid, { 'x-admin-token': adminToken }, { password: null }),
    ]);
    expect(reset.statusCode).toBe(200);
    expect(login.statusCode).toBe(409);
    expect(login.json().error).toBe('changed');
    // Without the reset, the same login is fine.
    expect((await session({ name: 'Ann' })).statusCode).toBe(200);
  });

  it('let a login through when nothing changed', async () => {
    await join(t.app, id, 'Ann', 'secret-1');
    const response = await session({ name: 'ann', password: 'secret-1' });
    expect(response.statusCode).toBe(200);
    expect(response.json().created).toBe(false);
  });
});
