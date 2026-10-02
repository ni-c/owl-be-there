import { describe, expect, it } from 'vitest';
import {
  BASE58,
  CreateEventBody,
  DEFAULT_EMOJI,
  EMOJI_KEYS,
  EMOJIS,
  expiresOn,
  formatDayRange,
  ID_LENGTH,
  isExpired,
  isId,
  isLanguage,
  LIMITS,
  makeId,
  MarksBody,
  RETENTION_DAYS,
  SERVER_TEXTS,
  SessionBody,
  StatusBody,
  UpdateEventBody,
  UpdateParticipantBody,
} from '../src/index.js';

describe('ids', () => {
  it('draws twelve characters from the alphabet', () => {
    let next = 0;
    const id = makeId((max) => next++ % max);
    expect(id).toHaveLength(ID_LENGTH);
    expect(id).toBe(BASE58.slice(0, 12));
    expect(isId(id)).toBe(true);
  });

  it('covers both ends of the alphabet', () => {
    expect(makeId(() => 0)).toBe('111111111111');
    expect(makeId((max) => max - 1)).toBe('zzzzzzzzzzzz');
  });

  it('refuses the characters base58 leaves out, and wrong lengths', () => {
    for (const bad of [
      '0OIl11111111',
      '11111111111',
      '1111111111111',
      '',
      '11111111111/',
    ]) {
      expect(isId(bad), bad).toBe(false);
    }
  });
});

describe('emoji', () => {
  it('has a default that is on the list, and no duplicates', () => {
    expect(EMOJI_KEYS).toContain(DEFAULT_EMOJI);
    expect(new Set(Object.values(EMOJIS)).size).toBe(EMOJI_KEYS.length);
  });
});

describe('retention', () => {
  it('keeps an event ninety days after its last change', () => {
    expect(
      expiresOn({
        lastWriteDay: '2027-01-01',
        lastCandidateDay: '2027-01-10',
        finalEnd: null,
      })
    ).toBe('2027-04-01');
    expect(RETENTION_DAYS).toBe(90);
  });

  it('never lets an event go before the day after it is over', () => {
    expect(
      expiresOn({
        lastWriteDay: '2027-01-01',
        lastCandidateDay: '2027-09-30',
        finalEnd: null,
      })
    ).toBe('2027-10-01');
    expect(
      expiresOn({
        lastWriteDay: '2027-01-01',
        lastCandidateDay: '2027-06-01',
        finalEnd: '2027-09-30',
      })
    ).toBe('2027-10-01');
  });

  it('expires on the day after its last day, not on it', () => {
    expect(isExpired('2027-04-01', '2027-04-01')).toBe(false);
    expect(isExpired('2027-04-01', '2027-04-02')).toBe(true);
    expect(isExpired('2027-04-01', '2027-03-31')).toBe(false);
  });
});

describe('texts', () => {
  it('formats a day and a block of days', () => {
    expect(formatDayRange('2027-03-06', '2027-03-06', 'en-GB')).toMatch(
      /^Sat,? 6 March 2027$/
    );
    expect(formatDayRange('2027-03-06', '2027-03-07', 'de-DE')).toMatch(
      /^Sa\., 6\.\s?–\s?So\., 7\. März 2027$/
    );
  });

  it('counts answers in previews', () => {
    expect(SERVER_TEXTS.en.previewOpen(0)).not.toMatch(/\d/);
    expect(SERVER_TEXTS.en.previewOpen(1)).toContain('1 answer so far');
    expect(SERVER_TEXTS.de.previewOpen(2)).toContain('bisher 2 Antworten');
  });

  it('announces a decision and signs calendar entries', () => {
    expect(SERVER_TEXTS.en.previewDecided('Sat 6 March')).toBe(
      "It's decided: Sat 6 March"
    );
    expect(SERVER_TEXTS.de.previewDecided('Sa., 6. März')).toBe(
      'Es ist entschieden: Sa., 6. März'
    );
    expect(SERVER_TEXTS.de.previewOpen(1)).toContain('bisher 1 Antwort');
    expect(SERVER_TEXTS.de.previewOpen(0)).not.toMatch(/\d/);
    expect(SERVER_TEXTS.en.previewOpen(3)).toContain('3 answers so far');
  });

  it('knows its languages', () => {
    expect(isLanguage('de')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
  });
});

describe('schemas', () => {
  const valid = {
    title: '  Summer   tournament ',
    emoji: 'soccer',
    language: 'en',
    durationDays: 1,
    days: ['2027-03-06'],
  };

  it('cleans text before checking its length', () => {
    const parsed = CreateEventBody.parse(valid);
    expect(parsed.title).toBe('Summer tournament');
    const padded = CreateEventBody.parse({
      ...valid,
      title: `${'x'.repeat(LIMITS.title)}   `,
    });
    expect(padded.title).toHaveLength(LIMITS.title);
  });

  it('refuses titles that are blank or too long, and unknown fields', () => {
    expect(CreateEventBody.safeParse({ ...valid, title: '   ' }).success).toBe(
      false
    );
    expect(
      CreateEventBody.safeParse({
        ...valid,
        title: 'x'.repeat(LIMITS.title + 1),
      }).success
    ).toBe(false);
    expect(CreateEventBody.safeParse({ ...valid, admin: true }).success).toBe(
      false
    );
  });

  it('refuses invalid days, durations and emoji', () => {
    expect(CreateEventBody.safeParse({ ...valid, days: [] }).success).toBe(
      false
    );
    expect(
      CreateEventBody.safeParse({ ...valid, days: ['2027-02-30'] }).success
    ).toBe(false);
    expect(
      CreateEventBody.safeParse({ ...valid, durationDays: 0 }).success
    ).toBe(false);
    expect(
      CreateEventBody.safeParse({
        ...valid,
        durationDays: LIMITS.durationDays + 1,
      }).success
    ).toBe(false);
    expect(
      CreateEventBody.safeParse({ ...valid, emoji: 'rocket' }).success
    ).toBe(false);
  });

  it('keeps line breaks in descriptions and refuses blank roster names', () => {
    expect(
      CreateEventBody.parse({ ...valid, description: 'a\r\nb' }).description
    ).toBe('a\nb');
    expect(
      CreateEventBody.safeParse({ ...valid, roster: ['Anna', ' '] }).success
    ).toBe(false);
  });

  it('accepts a status change only in its three shapes', () => {
    expect(StatusBody.safeParse({ status: 'open' }).success).toBe(true);
    expect(
      StatusBody.safeParse({ status: 'finalized', start: '2027-03-06' }).success
    ).toBe(true);
    expect(StatusBody.safeParse({ status: 'finalized' }).success).toBe(false);
    expect(StatusBody.safeParse({ status: 'deleted' }).success).toBe(false);
  });

  it('checks the participant bodies', () => {
    expect(SessionBody.safeParse({ name: 'Max' }).success).toBe(true);
    expect(SessionBody.safeParse({ name: 'Max', password: '' }).success).toBe(
      false
    );
    expect(
      MarksBody.safeParse({ baseRev: -1, yes: [], maybe: [] }).success
    ).toBe(false);
    expect(UpdateParticipantBody.safeParse({ password: 'abc' }).success).toBe(
      false
    );
    expect(UpdateParticipantBody.safeParse({ password: null }).success).toBe(
      true
    );
    expect(
      UpdateEventBody.safeParse({ minCount: null, location: null }).success
    ).toBe(true);
  });
});
