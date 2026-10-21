import { addDays, answerFor, LIMITS, respondentOf } from '@owl/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createEvent,
  eventBody,
  getSnapshot,
  participantOf,
  join,
  mark,
  testApp,
  WEEKEND,
  type TestApp,
  adminHeaders,
  sessionRequest,
  setStatus,
  patchEvent,
  patchParticipant,
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

const close = () => setStatus(t.app, id, adminToken, { status: 'closed' });

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
    const without = await sessionRequest(t.app, id, { name: 'Max' });
    expect(without.statusCode).toBe(401);
    expect(without.json().error).toBe('password_required');
    const wrong = await sessionRequest(t.app, id, {
      name: 'Max',
      password: 'nope',
    });
    expect(wrong.json().error).toBe('wrong_password');
    expect(
      (await sessionRequest(t.app, id, { name: 'max', password: 'secret-1' }))
        .statusCode
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
    expect(
      (await sessionRequest(t.app, id, { name: 'New', password: 'abc' })).json()
        .error
    ).toBe('password_too_short');
    await join(t.app, id, 'Max');
    expect(
      (await sessionRequest(t.app, id, { name: 'Max', password: 'abc' })).json()
        .error
    ).toBe('password_too_short');
  });

  it('counts the length of a password in characters, not UTF-16 units', async () => {
    // Three emoji are six UTF-16 units but three characters.
    const emoji = await sessionRequest(t.app, id, {
      name: 'New',
      password: '😀😀😀',
    });
    expect(emoji.statusCode).toBe(400);
    expect(emoji.json().error).toBe('password_too_short');
    await join(t.app, id, 'Max');
    expect(
      (
        await sessionRequest(t.app, id, { name: 'Max', password: '😀😀😀' })
      ).json().error
    ).toBe('password_too_short');
    // Five characters are still too few, six are enough.
    expect(
      (
        await sessionRequest(t.app, id, {
          name: 'New',
          password: '😀'.repeat(5),
        })
      ).statusCode
    ).toBe(400);
    expect(
      (
        await sessionRequest(t.app, id, {
          name: 'New',
          password: '😀'.repeat(6),
        })
      ).statusCode
    ).toBe(200);
    // Accented letters are one character each, in either form.
    expect(
      (await sessionRequest(t.app, id, { name: 'Ann', password: 'éééééé' }))
        .statusCode
    ).toBe(200);
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
    expect((await sessionRequest(t.app, id, { name: 'Max' })).statusCode).toBe(
      200
    );
    const fresh = await sessionRequest(t.app, id, { name: 'Newcomer' });
    expect(fresh.statusCode).toBe(409);
    expect(fresh.json().error).toBe('closed');
  });

  describe('at the limit of people', () => {
    const roster = (count: number) =>
      Array.from({ length: count }, (_, i) => `P${i}`);
    const count = async (eventId: string) =>
      (await getSnapshot(t.app, eventId)).participants.length;

    it('lets the last free place be taken, and refuses the next new name', async () => {
      const full = await createEvent(t.app, {
        roster: roster(LIMITS.participants - 1),
      });
      const last = await join(t.app, full.id, 'Last');
      expect(last.created).toBe(true);
      expect(await count(full.id)).toBe(LIMITS.participants);
      const over = await sessionRequest(t.app, full.id, { name: 'Over' });
      expect(over.statusCode).toBe(409);
      expect(over.json().error).toBe('full');
      expect(await count(full.id)).toBe(LIMITS.participants);
    });

    it('refuses a new name in an event that is full, with or without a password', async () => {
      const full = await createEvent(t.app, {
        roster: roster(LIMITS.participants),
      });
      for (const extra of [{}, { password: 'secret-1' }]) {
        const over = await sessionRequest(t.app, full.id, {
          name: 'Newcomer',
          ...extra,
        });
        expect(over.statusCode, JSON.stringify(extra)).toBe(409);
        expect(over.json().error).toBe('full');
      }
      expect(await count(full.id)).toBe(LIMITS.participants);
    });

    it('needs no room for a name that is there already', async () => {
      const full = await createEvent(t.app, {
        roster: roster(LIMITS.participants),
      });
      const again = await join(t.app, full.id, 'p1');
      expect(again.created).toBe(false);
      // Protecting the name changes the entry, it does not add one.
      const protectedName = await join(t.app, full.id, 'P1', 'secret-1');
      expect(protectedName).toMatchObject({
        participantId: again.participantId,
        created: false,
      });
      expect(await count(full.id)).toBe(LIMITS.participants);
    });

    it('has room again once somebody is deleted', async () => {
      const full = await createEvent(t.app, {
        roster: roster(LIMITS.participants),
      });
      expect(
        (await sessionRequest(t.app, full.id, { name: 'Newcomer' })).statusCode
      ).toBe(409);
      const first = await join(t.app, full.id, 'P0');
      const removed = await t.app.inject({
        method: 'DELETE',
        url: `/api/events/${full.id}/participants/${first.participantId}`,
        headers: adminHeaders(full.adminToken),
      });
      expect(removed.statusCode).toBe(204);
      expect((await join(t.app, full.id, 'Newcomer')).created).toBe(true);
      expect(await count(full.id)).toBe(LIMITS.participants);
    });
  });

  it('does not let a closed poll be used to protect a name', async () => {
    const max = await join(t.app, id, 'Max');
    await close();
    const response = await sessionRequest(t.app, id, {
      name: 'Max',
      password: 'secret-1',
    });
    expect(response.json().token).toBe(max.token);
    expect((await getSnapshot(t.app, id)).participants[0].hasPassword).toBe(
      false
    );
  });

  describe('invisible characters in a name', () => {
    const invisibles = [
      '\u200D',
      '\u200C',
      '\u{E0020}',
      '\u{E0041}',
      '\u206A',
      '\u2800',
    ];
    const people = async (eventId = id) =>
      (await getSnapshot(t.app, eventId)).participants as { name: string }[];

    it('refuses a lookalike with a Cyrillic or Greek letter split off by one', async () => {
      await join(t.app, id, 'Max');
      for (const c of invisibles) {
        for (const letter of ['\u0430', '\u03B1']) {
          const response = await sessionRequest(t.app, id, {
            name: `M${c}${letter}${c}x`,
          });
          expect(response.statusCode, `${c.codePointAt(0)}`).toBe(400);
          expect(response.json().error).toBe('validation_failed');
          expect(response.json().issues[0].path).toBe('name');
        }
      }
      // Nobody was registered, and the plain mix is still refused.
      expect(await people()).toHaveLength(1);
      expect(
        (await sessionRequest(t.app, id, { name: 'M\u0430x' })).statusCode
      ).toBe(400);
    });

    it('lets a name in two scripts in, as long as no word mixes them', async () => {
      const response = await sessionRequest(t.app, id, {
        name: 'Max \u041C\u0430\u0445',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().created).toBe(true);
    });

    it('finds the existing person for a name with an invisible character before its accent', async () => {
      const jose = await join(t.app, id, 'Jos\u00E9');
      const zoe = await join(t.app, id, 'Zo\u00EB');
      for (const c of ['\u200D', '\u200C', '\uFE0F', '\u3164']) {
        expect(await join(t.app, id, `Jose${c}\u0301`)).toMatchObject({
          participantId: jose.participantId,
          created: false,
        });
      }
      expect(await join(t.app, id, 'Zoe\u200D\u0308')).toMatchObject({
        participantId: zoe.participantId,
        created: false,
      });
      expect((await people()).map((p) => p.name)).toEqual([
        'Jos\u00E9',
        'Zo\u00EB',
      ]);
    });

    it('still asks for the password of the person it finds', async () => {
      await join(t.app, id, 'Jos\u00E9', 'secret-1');
      const variant = 'Jose\u200D\u0301';
      const without = await sessionRequest(t.app, id, { name: variant });
      expect(without.statusCode).toBe(401);
      expect(without.json().error).toBe('password_required');
      expect(
        (
          await sessionRequest(t.app, id, {
            name: variant,
            password: 'nope-nope',
          })
        ).json().error
      ).toBe('wrong_password');
      expect(
        (
          await sessionRequest(t.app, id, {
            name: variant,
            password: 'secret-1',
          })
        ).statusCode
      ).toBe(200);
      expect(await people()).toHaveLength(1);
    });

    it('refuses a name of nothing but invisible characters', async () => {
      for (const name of [
        '\u200D\u200C',
        '\u{E0041}',
        '\u3164\u2800',
        ' \u200D ',
      ]) {
        const response = await sessionRequest(t.app, id, { name });
        expect(response.statusCode, name).toBe(400);
        expect(response.json().error).toBe('validation_failed');
      }
      expect(await people()).toHaveLength(0);
    });

    it('matches a roster name written with an invisible character, and dedupes a roster by it', async () => {
      const roster = await createEvent(t.app, {
        roster: [
          'Jos\u00E9',
          'Jose\u200D\u0301',
          'Zoe\u200D\u0308',
          'Zo\u00EB',
        ],
      });
      expect((await people(roster.id)).map((p) => p.name)).toEqual([
        'Jos\u00E9',
        'Zoe\u200D\u0308',
      ]);
      const again = await join(t.app, roster.id, 'Jose\u200C\u0301');
      expect(again.created).toBe(false);
      expect(await people(roster.id)).toHaveLength(2);
    });

    it('refuses a split lookalike in a roster, at creation and when adding', async () => {
      const created = await t.app.inject({
        method: 'POST',
        url: '/api/events',
        payload: eventBody({ roster: ['M\u200D\u0430\u200Dx'] }),
      });
      expect(created.statusCode).toBe(400);
      const added = await t.app.inject({
        method: 'POST',
        url: `/api/events/${id}/participants`,
        headers: adminHeaders(adminToken),
        payload: { names: ['Ben', 'M\u2800\u03B1\u2800x'] },
      });
      expect(added.statusCode).toBe(400);
      expect(await people()).toHaveLength(0);
    });
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

  describe('a save sent as the page closes (touched)', () => {
    const put = (
      who: { participantId: string; token: string },
      payload: Record<string, unknown>
    ) =>
      t.app.inject({
        method: 'PUT',
        url: `/api/events/${id}/participants/${who.participantId}/marks`,
        headers: { 'x-participant-token': who.token },
        payload,
      });

    it('applies only the touched days on a stale revision and keeps the rest', async () => {
      const max = await join(t.app, id, 'Max');
      // Another device saved 03-06 as maybe at rev 1.
      await mark(t.app, id, max, [], ['2027-03-06'], 0);
      const late = await put(max, {
        baseRev: 0,
        yes: ['2027-03-07'],
        maybe: [],
        touched: ['2027-03-07'],
      });
      expect(late.statusCode).toBe(200);
      expect(late.json()).toMatchObject({
        rev: 2,
        yes: ['2027-03-07'],
        maybe: ['2027-03-06'],
      });
      const person = (await getSnapshot(t.app, id)).participants[0];
      expect(person).toMatchObject({
        yes: ['2027-03-07'],
        maybe: ['2027-03-06'],
        rev: 2,
      });
    });

    it('removes a touched day the save does not carry, and changes a state', async () => {
      const max = await join(t.app, id, 'Max');
      await mark(t.app, id, max, ['2027-03-06', '2027-03-07'], [], 0);
      const late = await put(max, {
        baseRev: 0,
        yes: [],
        maybe: ['2027-03-07'],
        touched: ['2027-03-06', '2027-03-07'],
      });
      expect(late.json()).toMatchObject({
        rev: 2,
        yes: [],
        maybe: ['2027-03-07'],
      });
    });

    it('with no touched day changes nothing but the revision', async () => {
      const max = await join(t.app, id, 'Max');
      await mark(t.app, id, max, ['2027-03-06'], [], 0);
      const late = await put(max, {
        baseRev: 0,
        yes: [],
        maybe: [],
        touched: [],
      });
      expect(late.json()).toMatchObject({ rev: 2, yes: ['2027-03-06'] });
    });

    it('ignores a touched day that is no candidate', async () => {
      const max = await join(t.app, id, 'Max');
      await mark(t.app, id, max, ['2027-03-06'], [], 0);
      const late = await put(max, {
        baseRev: 0,
        yes: [],
        maybe: [],
        touched: ['2031-01-01'],
      });
      expect(late.statusCode).toBe(200);
      expect(late.json()).toMatchObject({ yes: ['2027-03-06'] });
    });

    it('answers a current revision like any save, without the merged marks', async () => {
      const max = await join(t.app, id, 'Max');
      const saved = await put(max, {
        baseRev: 0,
        yes: ['2027-03-06'],
        maybe: [],
        touched: ['2027-03-06'],
      });
      expect(saved.statusCode).toBe(200);
      expect(Object.keys(saved.json()).sort()).toEqual(['rev', 'version']);
    });

    it('still refuses a save from a revision ahead of the server, and one without touched', async () => {
      const max = await join(t.app, id, 'Max');
      const ahead = await put(max, {
        baseRev: 5,
        yes: ['2027-03-06'],
        maybe: [],
        touched: ['2027-03-06'],
      });
      expect(ahead.statusCode).toBe(409);
      await mark(t.app, id, max, ['2027-03-06'], [], 0);
      expect((await mark(t.app, id, max, [], [], 0)).statusCode).toBe(409);
    });
  });

  it('refuses a day marked as both yes and maybe', async () => {
    const max = await join(t.app, id, 'Max');
    const response = await mark(t.app, id, max, ['2027-03-06'], ['2027-03-06']);
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_marks');
  });

  it('keeps only the candidate days of a save', async () => {
    const max = await join(t.app, id, 'Max');
    const response = await mark(
      t.app,
      id,
      max,
      ['2027-03-09', '2027-03-06'],
      ['2027-03-10', '2027-03-07']
    );
    expect(response.statusCode).toBe(200);
    expect((await getSnapshot(t.app, id)).participants[0]).toMatchObject({
      yes: ['2027-03-06'],
      maybe: ['2027-03-07'],
    });
    // Nothing but strangers is a save of no marks: still an answer.
    expect((await mark(t.app, id, max, ['2027-03-09'], [], 1)).statusCode).toBe(
      200
    );
    expect((await getSnapshot(t.app, id)).participants[0]).toMatchObject({
      yes: [],
      maybe: [],
      answered: true,
    });
  });

  describe('after the organiser removed a day', () => {
    const DAYS = ['2027-03-05', ...WEEKEND];
    const remove = (days: string[]) =>
      patchEvent(t.app, id, adminToken, { days, baseDays: DAYS });

    it('answers a save that still carries it with the 409 and the current marks', async () => {
      const max = await join(t.app, id, 'Max');
      await mark(t.app, id, max, ['2027-03-06', '2027-03-07']);
      expect((await remove(['2027-03-05', '2027-03-06'])).statusCode).toBe(200);
      // A stale save, from a device that still has 2027-03-07.
      const late = await mark(
        t.app,
        id,
        max,
        ['2027-03-05', '2027-03-06', '2027-03-07'],
        [],
        1
      );
      expect(late.statusCode).toBe(409);
      expect(late.json()).toMatchObject({
        error: 'stale',
        yes: ['2027-03-06'],
        maybe: [],
      });
    });

    it('drops it from a save that is up to date, and from one that empties the marks', async () => {
      const max = await join(t.app, id, 'Max');
      await mark(t.app, id, max, ['2027-03-06', '2027-03-07']);
      await remove(['2027-03-05', '2027-03-06']);
      const rev = (await getSnapshot(t.app, id)).participants[0].rev as number;
      expect(
        (await mark(t.app, id, max, ['2027-03-05', '2027-03-07'], [], rev))
          .statusCode
      ).toBe(200);
      expect((await getSnapshot(t.app, id)).participants[0].yes).toEqual([
        '2027-03-05',
      ]);
      expect(
        (await mark(t.app, id, max, ['2027-03-07'], ['2027-03-08'], rev + 1))
          .statusCode
      ).toBe(200);
      expect((await getSnapshot(t.app, id)).participants[0]).toMatchObject({
        yes: [],
        maybe: [],
        answered: true,
      });
    });

    it('still refuses yes and maybe on one remaining day', async () => {
      const max = await join(t.app, id, 'Max');
      await remove(['2027-03-05', '2027-03-06']);
      const response = await mark(
        t.app,
        id,
        max,
        ['2027-03-06', '2027-03-07'],
        ['2027-03-06']
      );
      expect(response.statusCode).toBe(400);
    });
  });

  describe('a day added after the person last answered', () => {
    const OLD = ['2027-03-05', ...WEEKEND];
    const NEW = '2027-03-08';
    const NEWER = '2027-03-09';
    // The days the event has now, as the organiser last saw them.
    let current: string[];
    beforeEach(() => {
      current = [...OLD];
    });

    const tick = (ms: number) => {
      t.clock.time += ms;
    };
    const add = async (...days: string[]) => {
      const response = await patchEvent(t.app, id, adminToken, {
        days: [...current, ...days],
        baseDays: current,
      });
      expect(response.statusCode).toBe(200);
      current = [...current, ...days];
    };
    const view = async (who: { participantId: string }) =>
      (await getSnapshot(t.app, id)).participants.find(
        (p: { id: string }) => p.id === who.participantId
      );
    const answerOf = (
      person: Parameters<typeof respondentOf>[0],
      day: string
    ) => answerFor(respondentOf(person), day);
    const markedAt = (who: { participantId: string }) =>
      t.db.get<{ marks_at: number | null }>(
        'SELECT marks_at FROM participants WHERE id = ?',
        who.participantId
      )!.marks_at;
    const put = (
      who: { participantId: string; token: string },
      payload: Record<string, unknown>
    ) =>
      t.app.inject({
        method: 'PUT',
        url: `/api/events/${id}/participants/${who.participantId}/marks`,
        headers: { 'x-participant-token': who.token },
        payload,
      });

    /** Max answers one second after joining, the organiser adds NEW a second later. */
    const answeredThenAdded = async () => {
      const max = await join(t.app, id, 'Max');
      tick(1000);
      expect(
        (await mark(t.app, id, max, ['2027-03-06'], [], 0, OLD)).statusCode
      ).toBe(200);
      tick(1000);
      const addedAt = t.clock.time;
      await add(NEW);
      tick(500);
      return { max, addedAt };
    };

    it('stays new, and open rather than "no", for a save that did not know it', async () => {
      const { max, addedAt } = await answeredThenAdded();
      expect((await view(max)).unseen).toEqual([NEW]);
      const saved = await mark(t.app, id, max, ['2027-03-06'], [], 1, OLD);
      expect(saved.statusCode).toBe(200);
      const after = await view(max);
      expect(after).toMatchObject({
        answered: true,
        yes: ['2027-03-06'],
        unseen: [NEW],
        rev: 2,
      });
      expect(answerOf(after, NEW)).toBe('open');
      expect(answerOf(after, '2027-03-07')).toBe('no');
      expect(markedAt(max)).toBe(addedAt - 1);
    });

    it('is cleared by a save that knew it', async () => {
      const { max } = await answeredThenAdded();
      const saved = await mark(t.app, id, max, ['2027-03-06'], [], 1, [
        ...OLD,
        NEW,
      ]);
      expect(saved.statusCode).toBe(200);
      const after = await view(max);
      expect(after.unseen).toEqual([]);
      expect(answerOf(after, NEW)).toBe('no');
      expect(markedAt(max)).toBe(t.clock.time);
    });

    it('is cleared by a save without the list, as it always was', async () => {
      const { max } = await answeredThenAdded();
      expect(
        (await mark(t.app, id, max, ['2027-03-06'], [], 1)).statusCode
      ).toBe(200);
      const after = await view(max);
      expect(after.unseen).toEqual([]);
      expect(answerOf(after, NEW)).toBe('no');
      expect(markedAt(max)).toBe(t.clock.time);
    });

    it('stays new for a save that knew no day at all, and for one that knew only old ones', async () => {
      const { max, addedAt } = await answeredThenAdded();
      expect((await mark(t.app, id, max, [], [], 1, [])).statusCode).toBe(200);
      expect((await view(max)).unseen).toEqual([NEW]);
      expect(markedAt(max)).toBe(addedAt - 1);
      // An old day the list lacks was seen long ago: only NEW counts.
      expect(
        (await mark(t.app, id, max, [], [], 2, ['2027-03-06'])).statusCode
      ).toBe(200);
      expect((await view(max)).unseen).toEqual([NEW]);
    });

    it('keeps a day new through a save of nothing, "none of these days" included', async () => {
      const { max, addedAt } = await answeredThenAdded();
      const emptied = await mark(t.app, id, max, [], [], 1, OLD);
      expect(emptied.statusCode).toBe(200);
      expect(await view(max)).toMatchObject({
        answered: true,
        yes: [],
        maybe: [],
        unseen: [NEW],
      });
      expect(markedAt(max)).toBe(addedAt - 1);
      // The next save, now with the day known, clears it.
      expect(
        (await mark(t.app, id, max, [], [], 2, [...OLD, NEW])).statusCode
      ).toBe(200);
      expect((await view(max)).unseen).toEqual([]);
    });

    it('counts from joining for someone who never saved', async () => {
      const max = await join(t.app, id, 'Max');
      tick(1000);
      const addedAt = t.clock.time;
      await add(NEW);
      tick(500);
      // Never answered: nothing is unseen yet, and the first save decides.
      expect(await view(max)).toMatchObject({ answered: false, unseen: [] });
      const first = await mark(t.app, id, max, ['2027-03-06'], [], 0, OLD);
      expect(first.statusCode).toBe(200);
      const after = await view(max);
      expect(after).toMatchObject({ answered: true, unseen: [NEW] });
      expect(answerOf(after, NEW)).toBe('open');
      expect(markedAt(max)).toBe(addedAt - 1);

      const ana = await join(t.app, id, 'Ana');
      expect((await mark(t.app, id, ana, [], [], 0, current)).statusCode).toBe(
        200
      );
      expect((await view(ana)).unseen).toEqual([]);
      expect(markedAt(ana)).toBe(t.clock.time);
    });

    it('does not count a day added in the very millisecond someone joined', async () => {
      await add(NEW);
      const max = await join(t.app, id, 'Max');
      tick(500);
      expect((await mark(t.app, id, max, [], [], 0, OLD)).statusCode).toBe(200);
      expect((await view(max)).unseen).toEqual([]);
      expect(markedAt(max)).toBe(t.clock.time);
    });

    describe('with two days added at different times', () => {
      // NEW a second after Max answered, NEWER another second later.
      const twoAdded = async () => {
        const { max, addedAt } = await answeredThenAdded();
        tick(1000);
        const newerAt = t.clock.time;
        await add(NEWER);
        tick(500);
        return { max, addedAt, newerAt };
      };

      it('keeps only the later one when the sender knew the earlier', async () => {
        const { max, newerAt } = await twoAdded();
        expect(
          (await mark(t.app, id, max, [], [], 1, [...OLD, NEW])).statusCode
        ).toBe(200);
        expect((await view(max)).unseen).toEqual([NEWER]);
        expect(markedAt(max)).toBe(newerAt - 1);
        // What the stamp has passed is seen for good, even for a poorer list.
        expect((await mark(t.app, id, max, [], [], 2, OLD)).statusCode).toBe(
          200
        );
        expect((await view(max)).unseen).toEqual([NEWER]);
        expect(markedAt(max)).toBe(newerAt - 1);
      });

      it('keeps both when the sender knew neither', async () => {
        const { max, addedAt } = await twoAdded();
        expect((await mark(t.app, id, max, [], [], 1, OLD)).statusCode).toBe(
          200
        );
        expect((await view(max)).unseen).toEqual([NEW, NEWER]);
        expect(markedAt(max)).toBe(addedAt - 1);
      });

      it('keeps both when the list has the later day but not the earlier', async () => {
        // No snapshot looks like that; the earlier day decides.
        const { max, addedAt } = await twoAdded();
        expect(
          (await mark(t.app, id, max, [], [], 1, [...OLD, NEWER])).statusCode
        ).toBe(200);
        expect((await view(max)).unseen).toEqual([NEW, NEWER]);
        expect(markedAt(max)).toBe(addedAt - 1);
      });

      it('clears both when the sender knew both', async () => {
        const { max } = await twoAdded();
        expect(
          (await mark(t.app, id, max, [], [], 1, [...OLD, NEW, NEWER]))
            .statusCode
        ).toBe(200);
        expect((await view(max)).unseen).toEqual([]);
        expect(markedAt(max)).toBe(t.clock.time);
      });
    });

    it('keeps both of two days added in one millisecond, for a sender that knew one', async () => {
      const max = await join(t.app, id, 'Max');
      tick(1000);
      expect((await mark(t.app, id, max, [], [], 0, OLD)).statusCode).toBe(200);
      tick(1000);
      const addedAt = t.clock.time;
      await add(NEW);
      await add(NEWER);
      tick(500);
      expect(
        (await mark(t.app, id, max, [], [], 1, [...OLD, NEW])).statusCode
      ).toBe(200);
      // One stamp cannot tell them apart: the one it knew shows as new too.
      expect((await view(max)).unseen).toEqual([NEW, NEWER]);
      expect(markedAt(max)).toBe(addedAt - 1);
      expect(
        (await mark(t.app, id, max, [], [], 2, [...OLD, NEW, NEWER])).statusCode
      ).toBe(200);
      expect((await view(max)).unseen).toEqual([]);
    });

    it('never stamps earlier than the last answer', async () => {
      const max = await join(t.app, id, 'Max');
      tick(1000);
      expect((await mark(t.app, id, max, [], [], 0, OLD)).statusCode).toBe(200);
      const answeredAt = markedAt(max);
      // A day added the very next millisecond is the earliest a day can be new.
      tick(1);
      await add(NEW);
      tick(500);
      expect((await mark(t.app, id, max, [], [], 1, OLD)).statusCode).toBe(200);
      expect(markedAt(max)).toBe(answeredAt);
      expect((await view(max)).unseen).toEqual([NEW]);
      // Saving again with nothing new to keep never goes back either.
      expect((await mark(t.app, id, max, [], [], 2, OLD)).statusCode).toBe(200);
      expect(markedAt(max)).toBe(answeredAt);
    });

    it('ignores listed days that are no candidates', async () => {
      const { max, addedAt } = await answeredThenAdded();
      // The organiser removes 2027-03-05 meanwhile; the list still has it, and
      // a day that was never a candidate.
      const removed = await patchEvent(t.app, id, adminToken, {
        days: ['2027-03-06', '2027-03-07', NEW],
        baseDays: current,
      });
      expect(removed.statusCode).toBe(200);
      const saved = await mark(t.app, id, max, ['2027-03-06'], [], 1, [
        ...OLD,
        '2027-04-01',
      ]);
      expect(saved.statusCode).toBe(200);
      expect(await view(max)).toMatchObject({
        yes: ['2027-03-06'],
        unseen: [NEW],
      });
      expect(markedAt(max)).toBe(addedAt - 1);
      // Only strangers listed: the same as knowing nothing.
      expect(
        (await mark(t.app, id, max, [], [], 2, ['2027-04-01', '2027-04-02']))
          .statusCode
      ).toBe(200);
      expect((await view(max)).unseen).toEqual([NEW]);
    });

    it('refuses a list that is not valid, saving nothing', async () => {
      const { max, addedAt } = await answeredThenAdded();
      const base = { baseRev: 1, yes: ['2027-03-07'], maybe: [] };
      const tooMany = Array.from({ length: LIMITS.days + 1 }, (_, i) =>
        addDays('2027-03-01', i)
      );
      for (const days of [
        ['2027-02-30'],
        ['2027-3-8'],
        ['tomorrow'],
        [''],
        [20270308],
        [null],
        'all',
        null,
        {},
        tooMany,
      ]) {
        const response = await put(max, { ...base, days });
        expect(response.statusCode, JSON.stringify(days).slice(0, 40)).toBe(
          400
        );
        expect(response.json().error).toBe('validation_failed');
      }
      // Nothing was saved, the revision and the answer time included.
      expect(await view(max)).toMatchObject({
        yes: ['2027-03-06'],
        rev: 1,
        unseen: [NEW],
      });
      expect(markedAt(max)).toBeLessThan(addedAt);
      // An extra field is as unknown as it was.
      const extra = await put(max, { ...base, days: OLD, known: OLD });
      expect(extra.statusCode).toBe(400);
    });

    it('accepts the longest list, beside the longest marks', async () => {
      const all = Array.from({ length: LIMITS.days }, (_, i) =>
        addDays('2027-03-05', i)
      );
      const big = await createEvent(t.app, { days: all });
      const max = await join(t.app, big.id, 'Max');
      tick(1000);
      // yes, maybe and the list at the limit each: the body must still fit.
      const strangers = Array.from({ length: LIMITS.days }, (_, i) =>
        addDays('2028-03-05', i)
      );
      const response = await t.app.inject({
        method: 'PUT',
        url: `/api/events/${big.id}/participants/${max.participantId}/marks`,
        headers: { 'x-participant-token': max.token },
        payload: { baseRev: 0, yes: all, maybe: strangers, days: all },
      });
      expect(response.statusCode).toBe(200);
      const person = (await getSnapshot(t.app, big.id)).participants[0];
      expect(person.yes).toHaveLength(LIMITS.days);
      expect(person.unseen).toEqual([]);
    });

    it('still answers a stale revision with the 409 and the current marks, and changes nothing', async () => {
      const { max, addedAt } = await answeredThenAdded();
      const late = await mark(t.app, id, max, ['2027-03-07'], [], 0, [
        ...OLD,
        NEW,
      ]);
      expect(late.statusCode).toBe(409);
      expect(late.json()).toEqual({
        error: 'stale',
        rev: 1,
        yes: ['2027-03-06'],
        maybe: [],
      });
      // The refused save did not clear the day, whatever it knew.
      expect((await view(max)).unseen).toEqual([NEW]);
      expect(markedAt(max)).toBeLessThan(addedAt);
      // The retry on the revision it was handed goes through.
      expect(
        (await mark(t.app, id, max, ['2027-03-07'], [], 1, OLD)).statusCode
      ).toBe(200);
      expect(await view(max)).toMatchObject({
        yes: ['2027-03-07'],
        rev: 2,
        unseen: [NEW],
      });
    });
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
      headers: adminHeaders(adminToken),
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
  it('renames, but not to a name someone else has', async () => {
    const max = await join(t.app, id, 'Max');
    await join(t.app, id, 'Ana');
    const taken = await patchParticipant(
      t.app,
      id,
      max.participantId,
      { 'x-participant-token': max.token },
      { name: 'ana' }
    );
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error).toBe('name_taken');
    const renamed = await patchParticipant(
      t.app,
      id,
      max.participantId,
      { 'x-participant-token': max.token },
      { name: 'Maximilian' }
    );
    expect(renamed.statusCode).toBe(200);
    expect((await participantOf(t.app, id, max.participantId)).name).toBe(
      'Maximilian'
    );
    // Renaming to another spelling of one's own name is fine.
    expect(
      (
        await patchParticipant(
          t.app,
          id,
          max.participantId,
          { 'x-participant-token': max.token },
          { name: 'MAXIMILIAN' }
        )
      ).statusCode
    ).toBe(200);
  });

  it('refuses a rename to a lookalike split by an invisible character', async () => {
    const max = await join(t.app, id, 'Max');
    const headers = { 'x-participant-token': max.token };
    for (const c of ['\u200D', '\u200C', '\u{E0041}', '\u206A', '\u2800']) {
      const response = await patchParticipant(
        t.app,
        id,
        max.participantId,
        headers,
        {
          name: `M${c}\u0430${c}x`,
        }
      );
      expect(response.statusCode, `${c.codePointAt(0)}`).toBe(400);
      expect(response.json().error).toBe('validation_failed');
    }
    expect((await getSnapshot(t.app, id)).participants[0].name).toBe('Max');
  });

  it('treats an invisible character before an accent as the same name', async () => {
    const jose = await join(t.app, id, 'Jos\u00E9');
    const ana = await join(t.app, id, 'Ana');
    const taken = await patchParticipant(
      t.app,
      id,
      ana.participantId,
      { 'x-participant-token': ana.token },
      { name: 'Jose\u200D\u0301' }
    );
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error).toBe('name_taken');
    // One's own name in that spelling is no clash.
    const own = await patchParticipant(
      t.app,
      id,
      jose.participantId,
      { 'x-participant-token': jose.token },
      { name: 'Jose\u200D\u0301' }
    );
    expect(own.statusCode).toBe(200);
    expect((await participantOf(t.app, id, jose.participantId)).name).toBe(
      'Jose\u200D\u0301'
    );
  });

  it('keeps every part of the participant view coming from the one row', async () => {
    const max = await join(t.app, id, 'Max');
    await join(t.app, id, 'Ana');
    // Marks, a day added after the answer (unseen) and a password: every part
    // of the view must come from the one row.
    await mark(t.app, id, max, ['2027-03-06'], ['2027-03-07']);
    t.clock.advanceDays(1);
    const days = (await getSnapshot(t.app, id)).event.days as string[];
    await patchEvent(t.app, id, adminToken, {
      days: [...days, '2027-03-08'],
      baseDays: days,
    });
    const response = await patchParticipant(
      t.app,
      id,
      max.participantId,
      { 'x-participant-token': max.token },
      { note: 'late', password: 'secret-1' }
    );
    expect(response.statusCode).toBe(200);
    const view = await participantOf(t.app, id, max.participantId);
    expect(view).toMatchObject({
      note: 'late',
      hasPassword: true,
      answered: true,
      yes: ['2027-03-06'],
      maybe: ['2027-03-07'],
      unseen: ['2027-03-08'],
    });
    // Someone who has not answered has nothing unseen and no marks.
    const ana = (await getSnapshot(t.app, id)).participants.find(
      (p: { name: string }) => p.name === 'Ana'
    );
    const quiet = await patchParticipant(
      t.app,
      id,
      ana.id,
      adminHeaders(adminToken),
      { note: 'x' }
    );
    expect(quiet.statusCode).toBe(200);
    expect(await participantOf(t.app, id, ana.id)).toMatchObject({
      answered: false,
      yes: [],
      maybe: [],
      unseen: [],
    });
  });

  it('sets and clears the note', async () => {
    const max = await join(t.app, id, 'Max');
    await patchParticipant(
      t.app,
      id,
      max.participantId,
      { 'x-participant-token': max.token },
      { note: 'only after 6 pm' }
    );
    expect((await participantOf(t.app, id, max.participantId)).note).toBe(
      'only after 6 pm'
    );
    await patchParticipant(
      t.app,
      id,
      max.participantId,
      { 'x-participant-token': max.token },
      { note: '' }
    );
    expect((await participantOf(t.app, id, max.participantId)).note).toBeNull();
  });

  it('changes the password, handing the owner a new token and revoking the old', async () => {
    const max = await join(t.app, id, 'Max');
    const response = await patchParticipant(
      t.app,
      id,
      max.participantId,
      { 'x-participant-token': max.token },
      { password: 'secret-1' }
    );
    expect(
      (await participantOf(t.app, id, max.participantId)).hasPassword
    ).toBe(true);
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

  it('counts the length of a new password in characters', async () => {
    const max = await join(t.app, id, 'Max');
    const headers = { 'x-participant-token': max.token };
    // The schema refuses it, counting characters like the session route.
    for (const password of ['😀😀😀', '😀'.repeat(5)]) {
      const response = await patchParticipant(
        t.app,
        id,
        max.participantId,
        headers,
        { password }
      );
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('validation_failed');
    }
    expect(
      (
        await patchParticipant(t.app, id, max.participantId, headers, {
          password: 'abc',
        })
      ).statusCode
    ).toBe(400);
    // Still unprotected, and the old token still works.
    expect((await getSnapshot(t.app, id)).participants[0].hasPassword).toBe(
      false
    );
    expect(
      (
        await patchParticipant(t.app, id, max.participantId, headers, {
          password: '😀'.repeat(6),
        })
      ).statusCode
    ).toBe(200);
  });

  it('lets the organiser reset a password without receiving a token', async () => {
    const max = await join(t.app, id, 'Max', 'secret-1');
    const response = await patchParticipant(
      t.app,
      id,
      max.participantId,
      adminHeaders(adminToken),
      {
        password: null,
      }
    );
    expect(response.json()).toEqual({ token: null });
    expect(
      (await participantOf(t.app, id, max.participantId)).hasPassword
    ).toBe(false);
    expect((await sessionRequest(t.app, id, { name: 'Max' })).statusCode).toBe(
      200
    );
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
      (await remove(ana.participantId, adminHeaders(adminToken))).statusCode
    ).toBe(204);
    expect((await getSnapshot(t.app, id)).participants).toEqual([]);
  });
});

describe('tokens revoked while a password is hashed', () => {
  it('no longer write: of two changes with one token only one wins', async () => {
    const max = await join(t.app, id, 'Max');
    const headers = { 'x-participant-token': max.token };
    const slow = patchParticipant(t.app, id, max.participantId, headers, {
      password: 'attacker-pw',
    });
    const clearing = patchParticipant(t.app, id, max.participantId, headers, {
      password: null,
    });
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
      (
        await patchParticipant(t.app, id, max.participantId, headers, {
          note: 'x',
        })
      ).statusCode
    ).toBe(403);
  });

  it('do not stop the organiser, whose key is no token', async () => {
    const max = await join(t.app, id, 'Max');
    const slow = patchParticipant(
      t.app,
      id,
      max.participantId,
      adminHeaders(adminToken),
      {
        password: 'organiser-pw',
      }
    );
    const clearing = patchParticipant(
      t.app,
      id,
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
      sessionRequest(t.app, id, { name: 'Ann', password: 'secret-1' }),
      patchParticipant(t.app, id, pid, adminHeaders(adminToken), {
        password: null,
      }),
    ]);
    expect(reset.statusCode).toBe(200);
    expect(login.statusCode).toBe(409);
    expect(login.json().error).toBe('changed');
    // Without the reset, the same login is fine.
    expect((await sessionRequest(t.app, id, { name: 'Ann' })).statusCode).toBe(
      200
    );
  });

  it('let a login through when nothing changed', async () => {
    await join(t.app, id, 'Ann', 'secret-1');
    const response = await sessionRequest(t.app, id, {
      name: 'ann',
      password: 'secret-1',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().created).toBe(false);
  });
});
