import { describe, expect, it } from 'vitest';
import {
  BASE58,
  CreateEventBody,
  DEFAULT_EMOJI,
  EMOJI_KEYS,
  emojiIcon,
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
  NewPassword,
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

describe('retention at the end of the calendar', () => {
  it('stops at 9999-12-31 instead of rolling into a five-digit year', () => {
    expect(
      expiresOn({
        lastWriteDay: '2027-01-01',
        lastCandidateDay: '9999-12-31',
        finalEnd: null,
        answered: true,
      })
    ).toBe('9999-12-31');
    expect(
      expiresOn({
        lastWriteDay: '9999-12-01',
        lastCandidateDay: '9999-12-02',
        finalEnd: null,
        answered: true,
      })
    ).toBe('9999-12-31');
    // The day before the end still works as always.
    expect(
      expiresOn({
        lastWriteDay: '2027-01-01',
        lastCandidateDay: '9999-12-30',
        finalEnd: null,
        answered: true,
      })
    ).toBe('9999-12-31');
  });
});

describe('retention at the very end of the calendar', () => {
  it('holds at the last day for every write day within the window', () => {
    for (const lastWriteDay of ['9999-12-31', '9999-12-30', '9999-10-02']) {
      expect(
        expiresOn({
          lastWriteDay,
          lastCandidateDay: '9999-12-31',
          finalEnd: null,
          answered: false,
        })
      ).toBe('9999-12-31');
    }
  });

  it('counts normally when the window ends on the last day', () => {
    expect(
      expiresOn({
        lastWriteDay: '9999-10-02',
        lastCandidateDay: '9999-10-02',
        finalEnd: null,
        answered: false,
      })
    ).toBe('9999-12-31');
    expect(
      expiresOn({
        lastWriteDay: '9999-10-01',
        lastCandidateDay: '9999-10-01',
        finalEnd: null,
        answered: false,
      })
    ).toBe('9999-12-30');
  });
});

describe('retention of an event nobody answered', () => {
  const unanswered = { finalEnd: null, answered: false } as const;

  it('goes ninety days after the last change, whatever its candidate days', () => {
    // The first and the last day a candidate day may take, and a year between.
    for (const lastCandidateDay of ['2026-12-31', '2027-06-01', '2032-03-01']) {
      expect(
        expiresOn({
          lastWriteDay: '2027-03-01',
          lastCandidateDay,
          ...unanswered,
        })
      ).toBe('2027-05-30');
    }
  });

  it('ignores a chosen date as well', () => {
    expect(
      expiresOn({
        lastWriteDay: '2027-03-01',
        lastCandidateDay: '2027-09-01',
        finalEnd: '2027-09-02',
        answered: false,
      })
    ).toBe('2027-05-30');
  });

  it('keeps the old rule once somebody has answered, and goes back without', () => {
    const input = {
      lastWriteDay: '2027-03-01',
      lastCandidateDay: '2032-03-01',
      finalEnd: null,
    } as const;
    expect(expiresOn({ ...input, answered: false })).toBe('2027-05-30');
    expect(expiresOn({ ...input, answered: true })).toBe('2032-03-02');
    expect(expiresOn({ ...input, answered: false })).toBe('2027-05-30');
  });

  it('does not outlast an answered event with a short horizon', () => {
    expect(
      expiresOn({
        lastWriteDay: '2027-03-01',
        lastCandidateDay: '2027-03-02',
        finalEnd: null,
        answered: true,
      })
    ).toBe('2027-05-30');
  });

  it('stops at 9999-12-31 as well', () => {
    expect(
      expiresOn({
        lastWriteDay: '9999-12-31',
        lastCandidateDay: '9999-12-31',
        ...unanswered,
      })
    ).toBe('9999-12-31');
  });
});

describe('the emoji icon', () => {
  it('draws every emoji on the list as it is', () => {
    for (const key of EMOJI_KEYS) {
      const svg = decodeURIComponent(
        emojiIcon(EMOJIS[key]).replace('data:image/svg+xml,', '')
      );
      expect(svg).toContain(`>${EMOJIS[key]}</text>`);
    }
  });

  it('escapes markup instead of writing it into the picture', () => {
    const icon = emojiIcon('</text><image href="x"/>');
    const svg = decodeURIComponent(icon.replace('data:image/svg+xml,', ''));
    expect(svg).not.toContain('<image');
    expect(svg).toContain('&lt;/text&gt;&lt;image href="x"/&gt;');
    expect(decodeURIComponent(emojiIcon('&'))).toContain('&amp;');
  });
});

describe('text that shows nothing', () => {
  const create = (fields: Record<string, unknown>) =>
    CreateEventBody.safeParse({
      title: 'Summer tournament',
      emoji: 'soccer',
      language: 'en',
      durationDays: 1,
      days: ['2027-03-06'],
      ...fields,
    });

  it('refuses a title made only of characters that take no room', () => {
    for (const title of [
      '\u3164',
      '\u200D',
      '\u2800',
      '\uFE0F',
      '\u200C\u200D',
      '\u{E0041}',
      '',
      '   ',
      '\uFFFF',
    ]) {
      expect(create({ title }).success, JSON.stringify(title)).toBe(false);
    }
  });

  it('still accepts a title of one emoji, and one with a joiner inside', () => {
    expect(create({ title: '🎉' }).success).toBe(true);
    expect(create({ title: 'A\u200DB' }).success).toBe(true);
  });

  it('refuses a location, a creator name and a description that only look empty', () => {
    expect(create({ location: '\u3164' }).success).toBe(false);
    expect(create({ creatorName: '\u2800' }).success).toBe(false);
    expect(create({ description: 'a\n\u200D\u3164' }).success).toBe(true);
    expect(create({ description: '\u3164\n\u200D' }).success).toBe(false);
  });

  it('accepts those fields empty or absent', () => {
    expect(
      create({ location: '', creatorName: '   ', description: '' }).success
    ).toBe(true);
    expect(create({}).success).toBe(true);
  });

  it('refuses a name with only a tag character, a format control or a filler', () => {
    for (const name of ['\u{E0041}', '\u206A', '\u17B4', '\u3164', '\u200C']) {
      expect(SessionBody.safeParse({ name }).success, name).toBe(false);
    }
    for (const name of ['Zoë', '李雷', 'Max 🦉']) {
      expect(SessionBody.safeParse({ name }).success, name).toBe(true);
    }
  });
});

describe('length limits', () => {
  const name = (value: string) =>
    SessionBody.safeParse({ name: value }).success;
  const note = (value: string) =>
    UpdateParticipantBody.safeParse({ note: value }).success;

  it('count code points after cleaning, so an emoji is one', () => {
    expect(name('😀'.repeat(LIMITS.name))).toBe(true);
    expect(name('😀'.repeat(LIMITS.name + 1))).toBe(false);
    expect(note('😀'.repeat(LIMITS.note))).toBe(true);
    expect(note('😀'.repeat(LIMITS.note + 1))).toBe(false);
  });

  it('count a character that NFC splits as two', () => {
    // U+0958 becomes two code points when composed text is normalised.
    expect(name('\u0958'.repeat(LIMITS.name / 2))).toBe(true);
    expect(name('\u0958'.repeat(LIMITS.name / 2 + 1))).toBe(false);
    expect(note('\u0958'.repeat(LIMITS.note / 2))).toBe(true);
    expect(note('\u0958'.repeat(LIMITS.note / 2 + 1))).toBe(false);
  });

  it('keep the empty and the blank outside', () => {
    expect(name('')).toBe(false);
    expect(name('   ')).toBe(false);
    expect(note('')).toBe(true);
  });

  it('count a new password the way the session body does', () => {
    const create = (password: string) =>
      NewPassword.safeParse(password).success;
    expect(create('😀😀😀')).toBe(false); // three code points, six units
    expect(create('😀'.repeat(LIMITS.passwordMin))).toBe(true);
    expect(create('a'.repeat(LIMITS.passwordMin - 1))).toBe(false);
    expect(create('a'.repeat(LIMITS.passwordMin))).toBe(true);
    expect(create('a'.repeat(LIMITS.passwordMax))).toBe(true);
    expect(create('a'.repeat(LIMITS.passwordMax + 1))).toBe(false);
    expect(create('')).toBe(false);
  });
});

describe('names', () => {
  it('refuses a name made only of invisible characters', () => {
    expect(SessionBody.safeParse({ name: '\u200C' }).success).toBe(false);
    expect(SessionBody.safeParse({ name: '\u3164' }).success).toBe(false);
    expect(SessionBody.safeParse({ name: 'Max' }).success).toBe(true);
  });

  it('refuses a word that mixes Latin letters with Cyrillic or Greek ones', () => {
    const ok = (name: string) => SessionBody.safeParse({ name }).success;
    expect(ok('M\u0430x')).toBe(false); // Cyrillic a
    expect(ok('M\u03B1x')).toBe(false); // Greek alpha
    expect(ok('Ma\u0445')).toBe(false); // Cyrillic ha at the end
    expect(ok('\u041CAX')).toBe(false); // Cyrillic Em at the start
    expect(ok('Max M\u0430x')).toBe(false); // one bad word is enough
    expect(ok('Max')).toBe(true);
    expect(ok('\u041E\u043B\u044C\u0433\u0430')).toBe(true);
    expect(
      ok('\u0391\u03BB\u03AD\u03BE\u03B1\u03BD\u03B4\u03C1\u03BF\u03C2')
    ).toBe(true);
    // Different words in different scripts, and digits or emoji next to them.
    expect(ok('Olga \u041E\u043B\u044C\u0433\u0430')).toBe(true);
    expect(ok('Max-\u041E\u043B\u044C\u0433\u0430')).toBe(true);
    expect(ok('\u041E\u043B\u044C\u0433\u0430 2')).toBe(true);
    expect(ok('Max 🦉')).toBe(true);
    // The roster and the rename take the same rule.
    expect(
      CreateEventBody.safeParse({
        title: 'x',
        emoji: 'owl',
        language: 'en',
        durationDays: 1,
        days: ['2027-03-05'],
        roster: ['M\u0430x'],
      }).success
    ).toBe(false);
    expect(UpdateParticipantBody.safeParse({ name: 'M\u03B1x' }).success).toBe(
      false
    );
  });

  it('applies the rule at the length limit', () => {
    const limit = LIMITS.name;
    const ok = (name: string) => SessionBody.safeParse({ name }).success;
    expect(ok('a'.repeat(limit))).toBe(true);
    expect(ok('a'.repeat(limit - 1) + '\u0430')).toBe(false);
    expect(ok('a'.repeat(limit + 1))).toBe(false);
  });
});

describe('editing days', () => {
  it('needs the days an edit started from, and nothing more without days', () => {
    expect(UpdateEventBody.safeParse({ days: ['2027-03-06'] }).success).toBe(
      false
    );
    expect(
      UpdateEventBody.safeParse({
        days: ['2027-03-06'],
        baseDays: ['2027-03-05'],
      }).success
    ).toBe(true);
    expect(UpdateEventBody.safeParse({ title: 'x' }).success).toBe(true);
    expect(UpdateEventBody.safeParse({ baseDays: [] }).success).toBe(true);
  });
});

describe('retention', () => {
  it('keeps an event ninety days after its last change', () => {
    expect(
      expiresOn({
        lastWriteDay: '2027-01-01',
        lastCandidateDay: '2027-01-10',
        finalEnd: null,
        answered: true,
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
        answered: true,
      })
    ).toBe('2027-10-01');
    expect(
      expiresOn({
        lastWriteDay: '2027-01-01',
        lastCandidateDay: '2027-06-01',
        finalEnd: '2027-09-30',
        answered: true,
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
