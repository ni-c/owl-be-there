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
  LANGUAGE_NAMES,
  LANGUAGES,
  languagesByName,
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
    expect(formatDayRange('2027-03-06', '2027-03-06', 'es-ES')).toBe(
      'sáb, 6 de marzo de 2027'
    );
    expect(formatDayRange('2027-03-06', '2027-03-06', 'fr-FR')).toBe(
      'sam. 6 mars 2027'
    );
    expect(formatDayRange('2027-03-06', '2027-03-06', 'pt-PT')).toBe(
      'sábado, 6 de março de 2027'
    );
    expect(formatDayRange('2027-03-06', '2027-03-06', 'it-IT')).toBe(
      'sab 6 marzo 2027'
    );
    expect(formatDayRange('2027-03-06', '2027-03-06', 'ja-JP')).toBe(
      '2027年3月6日(土)'
    );
    expect(formatDayRange('2027-03-06', '2027-03-07', 'ja-JP')).toBe(
      '2027/03/06(土)～2027/03/07(日)'
    );
    expect(formatDayRange('2027-03-06', '2027-03-06', 'nl-NL')).toBe(
      'za 6 maart 2027'
    );
    expect(formatDayRange('2027-03-06', '2027-03-07', 'nl-NL')).toMatch(
      /^za 6\s?–\s?zo 7 maart 2027$/
    );
  });

  it('counts answers in previews', () => {
    expect(SERVER_TEXTS.en.previewOpen(0)).not.toMatch(/\d/);
    expect(SERVER_TEXTS.en.previewOpen(1)).toContain('1 answer so far');
    expect(SERVER_TEXTS.de.previewOpen(2)).toContain('bisher 2 Antworten');
    expect(SERVER_TEXTS.es.previewOpen(1)).toContain('1 respuesta');
    expect(SERVER_TEXTS.es.previewOpen(2)).toContain('2 respuestas');
    expect(SERVER_TEXTS.fr.previewOpen(1)).toContain('1 réponse');
    expect(SERVER_TEXTS.fr.previewOpen(2)).toContain('2 réponses');
    expect(SERVER_TEXTS.pt.previewOpen(1)).toContain('1 resposta');
    expect(SERVER_TEXTS.pt.previewOpen(2)).toContain('2 respostas');
    expect(SERVER_TEXTS.it.previewOpen(1)).toContain('1 risposta');
    expect(SERVER_TEXTS.it.previewOpen(2)).toContain('2 risposte');
    expect(SERVER_TEXTS.ja.previewOpen(0)).not.toMatch(/\d/);
    expect(SERVER_TEXTS.ja.previewOpen(1)).toContain('回答は現在1人');
    expect(SERVER_TEXTS.ja.previewOpen(2)).toContain('回答は現在2人');
    expect(SERVER_TEXTS.nl.previewOpen(1)).toContain('1 antwoord');
    expect(SERVER_TEXTS.nl.previewOpen(2)).toContain('2 antwoorden');
  });

  it('announces a decision and signs calendar entries', () => {
    expect(SERVER_TEXTS.en.previewDecided('Sat 6 March')).toBe(
      'The date is set: Sat 6 March'
    );
    expect(SERVER_TEXTS.de.previewDecided('Sa., 6. März')).toBe(
      'Der Termin steht: Sa., 6. März'
    );
    expect(SERVER_TEXTS.es.previewDecided('sáb, 6 de marzo')).toBe(
      'Ya hay fecha: sáb, 6 de marzo'
    );
    expect(SERVER_TEXTS.fr.previewDecided('sam. 6 mars')).toBe(
      'La date est fixée : sam. 6 mars'
    );
    expect(SERVER_TEXTS.pt.previewDecided('sábado, 6 de março')).toBe(
      'A data está marcada: sábado, 6 de março'
    );
    expect(SERVER_TEXTS.it.previewDecided('sab 6 marzo')).toBe(
      'La data è decisa: sab 6 marzo'
    );
    expect(SERVER_TEXTS.ja.previewDecided('2027年3月6日(土)')).toBe(
      '日程決定：2027年3月6日(土)'
    );
    expect(SERVER_TEXTS.nl.previewDecided('za 6 maart')).toBe(
      'De datum staat vast: za 6 maart'
    );
    expect(SERVER_TEXTS.de.previewOpen(1)).toContain('bisher 1 Antwort');
    expect(SERVER_TEXTS.de.previewOpen(0)).not.toMatch(/\d/);
    expect(SERVER_TEXTS.en.previewOpen(3)).toContain('3 answers so far');
  });

  it('knows its languages', () => {
    expect(isLanguage('de')).toBe(true);
    expect(isLanguage('es')).toBe(true);
    expect(isLanguage('fr')).toBe(true);
    expect(isLanguage('pt')).toBe(true);
    expect(isLanguage('it')).toBe(true);
    expect(isLanguage('ja')).toBe(true);
    expect(isLanguage('nl')).toBe(true);
    expect(isLanguage('sv')).toBe(false);
  });

  it('lists its languages by code, and by their own names for the picker', () => {
    expect(LANGUAGES).toEqual(['de', 'en', 'es', 'fr', 'it', 'ja', 'nl', 'pt']);
    expect(languagesByName().map((code) => LANGUAGE_NAMES[code])).toEqual([
      'Deutsch',
      'English',
      'Español',
      'Français',
      'Italiano',
      'Nederlands',
      'Português',
      '日本語',
    ]);
    expect([...languagesByName()].sort()).toEqual([...LANGUAGES]);
    // A fresh copy each time, so sorting never reorders LANGUAGES itself.
    expect(languagesByName()).not.toBe(languagesByName());
  });

  it('has every server text in each language, none of them empty', () => {
    const keys = Object.keys(SERVER_TEXTS.en).sort();
    for (const language of LANGUAGES) {
      const texts = SERVER_TEXTS[language];
      expect(Object.keys(texts).sort(), language).toEqual(keys);
      for (const value of Object.values(texts)) {
        const text = typeof value === 'function' ? value(0) : value;
        expect(text.trim(), language).not.toBe('');
      }
      expect(texts.previewOpen(2), language).toMatch(/2/);
      expect(texts.previewDecided('X'), language).toContain('X');
    }
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
