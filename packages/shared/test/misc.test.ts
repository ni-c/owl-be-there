import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  addDays,
  BASE58,
  cleanLine,
  cleanText,
  CreateEventBody,
  dayNumber,
  DEFAULT_EMOJI,
  EMOJI_KEYS,
  emojiIcon,
  EMOJIS,
  escapeMarkup,
  expiresOn,
  formatDayRange,
  ID_LENGTH,
  isId,
  isLanguage,
  isoFromDayNumber,
  isRtl,
  type Language,
  LAST_DAY,
  LANGUAGE_NAMES,
  LANGUAGES,
  languagesByName,
  LIMITS,
  LOCALES,
  makeId,
  MarksBody,
  maxISODate,
  persianNumber,
  pluralForm,
  nameKey,
  NewPassword,
  RETENTION_DAYS,
  RTL_LANGUAGES,
  SERVER_TEXTS,
  DESCRIPTION_EN,
  TAGLINES,
  SessionBody,
  snapshotEtag,
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
    ).toBe('2028-12-31');
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
        lastWriteDay: '9999-06-01',
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

  it('is the plain rule clamped to the last day, for every write day near it', () => {
    const last = dayNumber(LAST_DAY);
    const clamped = (day: string, days: number) =>
      isoFromDayNumber(Math.min(dayNumber(day) + days, last));
    for (let before = 0; before <= RETENTION_DAYS + 5; before += 1) {
      const lastWriteDay = isoFromDayNumber(last - before);
      for (const candidateBefore of [0, 1, 2, 400]) {
        for (const finalBefore of [null, 0, 1, 3]) {
          const lastCandidateDay = isoFromDayNumber(last - candidateBefore);
          const finalEnd =
            finalBefore === null ? null : isoFromDayNumber(last - finalBefore);
          const lastRelevant = maxISODate(
            finalEnd ?? lastCandidateDay,
            lastCandidateDay
          );
          const plain = clamped(lastWriteDay, RETENTION_DAYS);
          for (const answered of [false, true]) {
            expect(
              expiresOn({ lastWriteDay, lastCandidateDay, finalEnd, answered })
            ).toBe(
              answered ? maxISODate(plain, clamped(lastRelevant, 1)) : plain
            );
          }
        }
      }
    }
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
    expect(expiresOn({ ...input, answered: true })).toBe('2029-02-28');
    expect(expiresOn({ ...input, answered: false })).toBe('2027-05-30');
  });

  it('caps the answered extension at 730 days after the last change', () => {
    const base = {
      lastWriteDay: '2027-03-01',
      finalEnd: null,
      answered: true,
    } as const;
    // 2029-02-28 is day 730; the day after the last day lands exactly on it.
    expect(expiresOn({ ...base, lastCandidateDay: '2029-02-27' })).toBe(
      '2029-02-28'
    );
    expect(expiresOn({ ...base, lastCandidateDay: '2029-02-28' })).toBe(
      '2029-02-28'
    );
    expect(expiresOn({ ...base, lastCandidateDay: '2029-02-26' })).toBe(
      '2029-02-27'
    );
    expect(expiresOn({ ...base, lastCandidateDay: '2099-01-01' })).toBe(
      '2029-02-28'
    );
    // A chosen date far out is capped the same way.
    expect(
      expiresOn({
        ...base,
        lastCandidateDay: '2027-04-01',
        finalEnd: '2035-01-01',
      })
    ).toBe('2029-02-28');
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
    expect(svg).toContain('&lt;/text&gt;&lt;image href=&quot;x&quot;/&gt;');
    expect(decodeURIComponent(emojiIcon('&'))).toContain('&amp;');
  });

  it('writes every emoji on the list exactly as the escape it replaced did', () => {
    // The escape emojiIcon spelled out before it used escapeMarkup, verbatim.
    const before = (emoji: string): string => {
      const glyph = emoji
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${glyph}</text></svg>`;
      return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    };
    expect(EMOJI_KEYS).toHaveLength(30);
    for (const key of EMOJI_KEYS) {
      expect(emojiIcon(EMOJIS[key]), key).toBe(before(EMOJIS[key]));
    }
  });

  it('escapes the text the way the rest of the package does, quotes included', () => {
    const glyphOf = (emoji: string) =>
      decodeURIComponent(emojiIcon(emoji)).match(/>([^<]*)<\/text>/)![1];
    expect(glyphOf('&"\'')).toBe('&amp;&quot;&#39;');
    for (const text of ['&', '<', '>', '"', "'", '&amp;', '', '🦉<&>"\'']) {
      expect(glyphOf(text), text).toBe(escapeMarkup(text));
    }
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

describe('the text builders', () => {
  // The three pipelines as they were written out one by one, kept as the
  // reference for the single builder that replaced them.
  const blank = (text: string): boolean => text !== '' && nameKey(text) === '';
  const before = {
    requiredLine: (max: number) =>
      z
        .string()
        .max(max * 4)
        .transform(cleanLine)
        .pipe(z.string().min(1).max(max))
        .refine((text) => !blank(text), 'Needs a visible character'),
    line: (max: number) =>
      z
        .string()
        .max(max * 4)
        .transform(cleanLine)
        .pipe(z.string().max(max))
        .refine((text) => !blank(text), 'Needs a visible character'),
    paragraph: (max: number) =>
      z
        .string()
        .max(max * 4)
        .transform(cleanText)
        .pipe(z.string().max(max))
        .refine((text) => !blank(text), 'Needs a visible character'),
  };

  // Each builder as a field of the event body: title, location, description.
  const fields = [
    { builder: 'requiredLine', field: 'title', max: LIMITS.title },
    { builder: 'line', field: 'location', max: LIMITS.location },
    { builder: 'paragraph', field: 'description', max: LIMITS.description },
  ] as const;

  const create = (field: string, value: string) =>
    CreateEventBody.safeParse({
      title: 'Summer tournament',
      emoji: 'soccer',
      language: 'en',
      durationDays: 1,
      days: ['2027-03-06'],
      [field]: value,
    });

  const outcome = (result: z.ZodSafeParseResult<unknown>, field: string) =>
    result.success
      ? { value: (result.data as Record<string, unknown>)[field] }
      : { issues: result.error.issues.map((i) => `${i.code}: ${i.message}`) };

  const inputs = (max: number): string[] => [
    '',
    ' ',
    '\t\n',
    '\u200D',
    '\u200B',
    '\u3164',
    '\u2800',
    'a',
    '  a  ',
    'a'.repeat(max),
    'a'.repeat(max + 1),
    '😀'.repeat(max),
    '😀'.repeat(max + 1),
    // Exactly the raw cap (four times the limit), cleaning down to one letter.
    'a' + ' '.repeat(max * 4 - 1),
    // One character over the raw cap, though it would clean to one letter.
    'a' + ' '.repeat(max * 4),
    // Within the raw cap, but longer than the limit once cleaned.
    '😀'.repeat(max * 2),
    'a\nb',
    '\n\n a \r\n\r\n\r\n b\n',
    'a\n\u3164',
    '\u3164\n\u200D',
    'a\u200Db',
    'Zoë',
  ];

  for (const { builder, field, max } of fields) {
    it(`gives ${field} the result of the old ${builder} on every input`, () => {
      const reference = z.object({ value: before[builder](max) });
      for (const input of inputs(max)) {
        expect(
          outcome(create(field, input), field),
          JSON.stringify(input)
        ).toEqual(outcome(reference.safeParse({ value: input }), 'value'));
      }
    });
  }

  it('gives all three the same message for text that shows nothing', () => {
    for (const { field } of fields) {
      const result = create(field, '\u3164');
      expect(result.success, field).toBe(false);
      expect(
        result.error?.issues.map((issue) => issue.message),
        field
      ).toEqual(['Needs a visible character']);
    }
  });

  it('lets only the required line refuse an empty text', () => {
    expect(create('title', '').success).toBe(false);
    expect(create('title', ' \n ').success).toBe(false);
    expect(create('location', '').success).toBe(true);
    expect(create('description', '').success).toBe(true);
  });

  it('caps the raw text at four times the limit and the cleaned text at the limit', () => {
    for (const { field, max } of fields) {
      expect(create(field, 'a'.repeat(max)).success, field).toBe(true);
      expect(create(field, 'a'.repeat(max + 1)).success, field).toBe(false);
      // Blanks that clean away still count towards the raw cap.
      const padded = (length: number) => 'a' + ' '.repeat(length - 1);
      expect(create(field, padded(max * 4)).success, field).toBe(true);
      expect(create(field, padded(max * 4 + 1)).success, field).toBe(false);
    }
  });

  it('keeps the line breaks of a paragraph and folds them in a line', () => {
    const description = create('description', 'a \r\n b\n\n\n\nc');
    expect(description.data?.description).toBe('a\nb\n\nc');
    expect(create('location', 'a \r\n b\n\n\n\nc').data?.location).toBe(
      'a b c'
    );
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
});

describe('the name and tagline', () => {
  it('have an entry for every language and nothing else', () => {
    expect(Object.keys(TAGLINES).sort()).toEqual([...LANGUAGES].sort());
    expect(Object.keys(SERVER_TEXTS).sort()).toEqual([...LANGUAGES].sort());
  });

  it('are what the server texts say, in every language', () => {
    for (const language of LANGUAGES) {
      expect(SERVER_TEXTS[language].tagline, language).toBe(TAGLINES[language]);
      expect(TAGLINES[language].trim(), language).not.toBe('');
    }
    expect(SERVER_TEXTS.en.description).toBe(DESCRIPTION_EN);
  });
});

describe('the snapshot ETag', () => {
  it('is the version in quotes, v-prefixed', () => {
    expect(snapshotEtag(1)).toBe('"v1"');
    expect(snapshotEtag(42)).toBe('"v42"');
  });

  it('holds at the first version and at large ones', () => {
    expect(snapshotEtag(0)).toBe('"v0"');
    expect(snapshotEtag(Number.MAX_SAFE_INTEGER)).toBe(
      `"v${Number.MAX_SAFE_INTEGER}"`
    );
  });

  it('differs for every version', () => {
    const etags = [0, 1, 2, 10, 11, 100].map(snapshotEtag);
    expect(new Set(etags).size).toBe(etags.length);
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
      '2027年3月6日(土)～7日(日)'
    );
    expect(formatDayRange('2027-03-06', '2027-04-02', 'ja-JP')).toBe(
      '2027年3月6日(土)～4月2日(金)'
    );
    expect(formatDayRange('2027-12-31', '2028-01-02', 'ja-JP')).toBe(
      '2027年12月31日(金)～2028年1月2日(日)'
    );
    expect(formatDayRange('2027-03-06', '2027-03-07', 'zh-CN')).toBe(
      '2027年3月6日周六至3月7日周日'
    );
    expect(formatDayRange('2027-12-31', '2028-01-02', 'zh-TW')).toBe(
      '2027年12月31日週五至2028年1月2日週日'
    );
    expect(formatDayRange('2027-03-06', '2027-03-07', 'sv-SE')).toBe(
      'lör 6 mars 2027–sön 7 mars 2027'
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
    expect(SERVER_TEXTS.ja.previewOpen(1)).toContain('これまでに1人が回答');
    expect(SERVER_TEXTS.ja.previewOpen(2)).toContain('これまでに2人が回答');
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
      'La date est fixée : sam. 6 mars'
    );
    expect(SERVER_TEXTS.pt.previewDecided('sábado, 6 de março')).toBe(
      'A data está definida: sábado, 6 de março'
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
    expect(SERVER_TEXTS.pl.previewOpen(0)).toContain('Bez rejestracji.');
    expect(SERVER_TEXTS.pl.previewOpen(1)).toContain('1 odpowiedź');
    expect(SERVER_TEXTS.pl.previewOpen(2)).toContain('2 odpowiedzi');
    expect(SERVER_TEXTS.pl.previewOpen(5)).toContain('5 odpowiedzi');
    expect(SERVER_TEXTS.pl.previewMoreDays(1)).toBe('+ 1 dzień więcej');
    expect(SERVER_TEXTS.pl.previewMoreDays(22)).toBe('+ 22 dni więcej');
    expect(SERVER_TEXTS.nb.previewOpen(0)).not.toMatch(/\d/);
    expect(SERVER_TEXTS.nb.previewOpen(1)).toContain('1 svar så langt');
    expect(SERVER_TEXTS.nb.previewOpen(2)).toContain('2 svar så langt');
    expect(SERVER_TEXTS.nb.previewMoreDays(1)).toBe('+ 1 dag til');
    expect(SERVER_TEXTS.nb.previewMoreDays(5)).toBe('+ 5 dager til');
    expect(SERVER_TEXTS.sv.previewOpen(0)).not.toMatch(/\d/);
    expect(SERVER_TEXTS.sv.previewOpen(1)).toContain('1 svar hittills');
    expect(SERVER_TEXTS.sv.previewOpen(2)).toContain('2 svar hittills');
    expect(SERVER_TEXTS.sv.previewMoreDays(1)).toBe('+ 1 dag till');
    expect(SERVER_TEXTS.sv.previewMoreDays(5)).toBe('+ 5 dagar till');
    expect(SERVER_TEXTS.fi.previewOpen(0)).not.toMatch(/\d/);
    expect(SERVER_TEXTS.fi.previewOpen(1)).toContain('1 vastaus');
    expect(SERVER_TEXTS.fi.previewOpen(2)).toContain('2 vastausta');
    expect(SERVER_TEXTS.fi.previewMoreDays(1)).toBe('+ 1 päivä lisää');
    expect(SERVER_TEXTS.fi.previewMoreDays(5)).toBe('+ 5 päivää lisää');
    expect(SERVER_TEXTS.ar.previewOpen(0)).not.toMatch(/\d/);
    expect(SERVER_TEXTS.ar.previewOpen(1)).toContain('إجابة واحدة (1)');
    expect(SERVER_TEXTS.ar.previewOpen(2)).toContain('إجابتان (2)');
    expect(SERVER_TEXTS.ar.previewOpen(3)).toContain('3 إجابات');
    expect(SERVER_TEXTS.ar.previewOpen(11)).toContain('11 إجابة');
    expect(SERVER_TEXTS.ar.previewMoreDays(1)).toBe('يوم آخر (1)');
    expect(SERVER_TEXTS.ar.previewMoreDays(2)).toBe('يومان آخران (2)');
    expect(SERVER_TEXTS.ar.previewMoreDays(3)).toBe('3 أيام أخرى');
    expect(SERVER_TEXTS.ar.previewMoreDays(11)).toBe('11 يوماً آخر');
    for (const [count, answer, days] of [
      [0, '', '+ ещё 0 дней'],
      [1, '1 ответ', '+ ещё 1 день'],
      [2, '2 ответа', '+ ещё 2 дня'],
      [4, '4 ответа', '+ ещё 4 дня'],
      [5, '5 ответов', '+ ещё 5 дней'],
      [11, '11 ответов', '+ ещё 11 дней'],
      [21, '21 ответ', '+ ещё 21 день'],
      [22, '22 ответа', '+ ещё 22 дня'],
    ] as const) {
      if (count === 0)
        expect(SERVER_TEXTS.ru.previewOpen(count)).not.toMatch(/\d/);
      else expect(SERVER_TEXTS.ru.previewOpen(count)).toContain(answer);
      expect(SERVER_TEXTS.ru.previewMoreDays(count)).toBe(days);
    }
    for (const [count, answer, days] of [
      [0, '0 odpovědí', '+ 0 dalších dní'],
      [1, '1 odpověď', '+ 1 další den'],
      [2, '2 odpovědi', '+ 2 další dny'],
      [4, '4 odpovědi', '+ 4 další dny'],
      [5, '5 odpovědí', '+ 5 dalších dní'],
      [12, '12 odpovědí', '+ 12 dalších dní'],
      [22, '22 odpovědí', '+ 22 dalších dní'],
    ] as const) {
      if (count === 0)
        expect(SERVER_TEXTS.cs.previewOpen(count)).not.toMatch(/\d/);
      else expect(SERVER_TEXTS.cs.previewOpen(count)).toContain(answer);
      expect(SERVER_TEXTS.cs.previewMoreDays(count)).toBe(days);
    }
  });

  it('knows its languages', () => {
    expect(isLanguage('ar')).toBe(true);
    expect(isLanguage('cs')).toBe(true);
    expect(isLanguage('de')).toBe(true);
    expect(isLanguage('es')).toBe(true);
    expect(isLanguage('fi')).toBe(true);
    expect(isLanguage('fr')).toBe(true);
    expect(isLanguage('id')).toBe(true);
    expect(isLanguage('pt')).toBe(true);
    expect(isLanguage('it')).toBe(true);
    expect(isLanguage('ja')).toBe(true);
    expect(isLanguage('nb')).toBe(true);
    expect(isLanguage('nl')).toBe(true);
    expect(isLanguage('no')).toBe(false);
    expect(isLanguage('pl')).toBe(true);
    expect(isLanguage('ru')).toBe(true);
    expect(isLanguage('zh-Hant')).toBe(true);
    expect(isLanguage('zh-Hans')).toBe(true);
    expect(isLanguage('sv')).toBe(true);
    expect(isLanguage('tr')).toBe(true);
    expect(isLanguage('uk')).toBe(true);
    expect(isLanguage('vi')).toBe(true);
    expect(isLanguage('ko')).toBe(true);
    expect(isLanguage('pt-BR')).toBe(true);
    expect(isLanguage('es-419')).toBe(true);
    expect(isLanguage('es-MX')).toBe(false);
    expect(isLanguage('fa')).toBe(true);
    expect(isLanguage('ur')).toBe(true);
    expect(isLanguage('da')).toBe(false);
  });

  it('knows which languages are written right to left', () => {
    expect(RTL_LANGUAGES).toEqual(['ar', 'fa', 'ur']);
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('fa')).toBe(true);
    expect(isRtl('ur')).toBe(true);
    expect(isRtl('en')).toBe(false);
    expect(isRtl('he' as never)).toBe(false);
    expect(LANGUAGES.filter(isRtl)).toEqual([...RTL_LANGUAGES]);
  });

  it('formats Persian dates in the Gregorian calendar, with Persian digits', () => {
    const format = new Intl.DateTimeFormat(LOCALES.fa, {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
    expect(format.format(Date.UTC(2026, 9, 23))).toBe('۲۳ اکتبر');
  });

  it('lists its languages by code, and by their own names for the picker', () => {
    expect(LANGUAGES).toEqual([
      'ar',
      'cs',
      'de',
      'en',
      'es',
      'es-419',
      'fa',
      'fi',
      'fr',
      'id',
      'it',
      'ja',
      'ko',
      'nb',
      'nl',
      'pl',
      'pt',
      'pt-BR',
      'ru',
      'sv',
      'tr',
      'uk',
      'ur',
      'vi',
      'zh-Hans',
      'zh-Hant',
    ]);
    expect(languagesByName().map((code) => LANGUAGE_NAMES[code])).toEqual([
      'Bahasa Indonesia',
      'Čeština',
      'Deutsch',
      'English',
      'Español (España)',
      'Español (Latinoamérica)',
      'Français',
      'Italiano',
      'Nederlands',
      'Norsk (bokmål)',
      'Polski',
      'Português (Brasil)',
      'Português (Portugal)',
      'Suomi',
      'Svenska',
      'Tiếng Việt',
      'Türkçe',
      'Русский',
      'Українська',
      'اردو',
      'العربية',
      'فارسی',
      '한국어',
      '日本語',
      '简体中文',
      '繁體中文',
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
        const text =
          typeof value === 'function'
            ? (value as (argument: unknown) => string)(0)
            : value;
        expect(text.trim(), language).not.toBe('');
      }
      // Persian counts in its own digits, as its dates do.
      expect(texts.previewOpen(2), language).toMatch(
        language === 'fa' ? /۲/ : /2/
      );
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

  describe('the days a save knew', () => {
    const marks = { baseRev: 0, yes: ['2027-03-06'], maybe: [] };
    const parse = (days: unknown) => MarksBody.safeParse({ ...marks, days });

    it('is optional, so a client that does not send it still saves', () => {
      const old = MarksBody.safeParse(marks);
      expect(old.success).toBe(true);
      expect(old.data).not.toHaveProperty('days');
      // Present and undefined is absent, as JSON cannot tell them apart.
      expect(parse(undefined).success).toBe(true);
    });

    it('takes any number of valid days up to the limit, the empty list included', () => {
      expect(parse([]).data?.days).toEqual([]);
      expect(parse(['2027-03-06', '2027-03-05']).data?.days).toEqual([
        '2027-03-06',
        '2027-03-05',
      ]);
      const longest = Array.from({ length: LIMITS.days }, (_, i) =>
        addDays('2027-01-01', i)
      );
      expect(parse(longest).success).toBe(true);
      expect(
        parse([...longest, addDays('2027-01-01', LIMITS.days)]).success
      ).toBe(false);
    });

    it('refuses what is no list of days', () => {
      for (const days of [
        null,
        'all',
        {},
        7,
        [null],
        [20270306],
        [''],
        ['2027-02-30'],
        ['2027-13-01'],
        ['2027-3-6'],
        ['2027-03-06T00:00:00Z'],
      ])
        expect(parse(days).success, JSON.stringify(days)).toBe(false);
    });

    it('is the only addition: other fields are still refused', () => {
      expect(MarksBody.safeParse({ ...marks, day: [] }).success).toBe(false);
      expect(
        MarksBody.safeParse({ ...marks, days: [], known: [] }).success
      ).toBe(false);
    });
  });
});

/** A day, two days, a block over a month end and one over a year end. */
const DAY_RANGES: Record<Language, string[]> = {
  ar: [
    'السبت، 6 مارس 2027',
    'السبت، 6 – الأحد، 7 مارس، 2027',
    'السبت، 6 مارس – الجمعة، 2 أبريل، 2027',
    'الجمعة، 31 ديسمبر 2027 – الأحد، 2 يناير 2028',
  ],
  cs: [
    'so 6. března 2027',
    'so 6. 3. – ne 7. 3. 2027',
    'so 6. 3. – pá 2. 4. 2027',
    'pá 31. 12. 2027 – ne 2. 1. 2028',
  ],
  de: [
    'Sa., 6. März 2027',
    'Sa., 6. – So., 7. März 2027',
    'Sa., 6. März – Fr., 2. April 2027',
    'Fr., 31. Dezember 2027 – So., 2. Januar 2028',
  ],
  en: [
    'Sat, 6 March 2027',
    'Sat, 6 March – Sun, 7 March 2027',
    'Sat, 6 March – Fri, 2 April 2027',
    'Fri, 31 December 2027 – Sun, 2 January 2028',
  ],
  es: [
    'sáb, 6 de marzo de 2027',
    'sáb, 6 de marzo – dom, 7 de marzo de 2027',
    'sáb, 6 de marzo – vie, 2 de abril de 2027',
    'vie, 31 de diciembre de 2027 – dom, 2 de enero de 2028',
  ],
  'es-419': [
    'sáb, 6 de marzo de 2027',
    'sáb, 6 de marzo – dom, 7 de marzo de 2027',
    'sáb, 6 de marzo – vie, 2 de abril de 2027',
    'vie, 31 de diciembre de 2027 – dom, 2 de enero de 2028',
  ],
  fa: [
    'شنبه ۶ مارس ۲۰۲۷',
    'شنبه ۶ مارس تا یکشنبه ۷ مارس ۲۰۲۷',
    'شنبه ۶ مارس تا جمعه ۲ آوریل ۲۰۲۷',
    'جمعه ۳۱ دسامبر ۲۰۲۷ تا یکشنبه ۲ ژانویهٔ ۲۰۲۸',
  ],
  fi: [
    'la 6. maaliskuuta 2027',
    'la 6. – su 7. maaliskuuta 2027',
    'la 6. maaliskuuta – pe 2. huhtikuuta 2027',
    'pe 31. joulukuuta 2027 – su 2. tammikuuta 2028',
  ],
  fr: [
    'sam. 6 mars 2027',
    'sam. 6 – dim. 7 mars 2027',
    'sam. 6 mars – ven. 2 avril 2027',
    'ven. 31 décembre 2027 – dim. 2 janvier 2028',
  ],
  id: [
    'Sab, 6 Maret 2027',
    'Sab, 6 Maret – Min, 7 Maret 2027',
    'Sab, 6 Maret – Jum, 2 April 2027',
    'Jum, 31 Desember 2027 – Min, 2 Januari 2028',
  ],
  it: [
    'sab 6 marzo 2027',
    'sab 6 – dom 7 marzo 2027',
    'sab 6 marzo – ven 2 aprile 2027',
    'ven 31 dicembre 2027 – dom 2 gennaio 2028',
  ],
  ja: [
    '2027年3月6日(土)',
    '2027年3月6日(土)～7日(日)',
    '2027年3月6日(土)～4月2日(金)',
    '2027年12月31日(金)～2028年1月2日(日)',
  ],
  ko: [
    '2027년 3월 6일 토',
    '2027년 3월 6일 (토)~7일 (일)',
    '2027년 3월 6일 (토)~4월 2일 (금)',
    '2027년 12월 31일 (금)~2028년 1월 2일 (일)',
  ],
  nb: [
    'lør. 6. mars 2027',
    'lør. 6.–søn. 7. mars 2027',
    'lør. 6. mars–fre. 2. april 2027',
    'fre. 31. desember 2027–søn. 2. januar 2028',
  ],
  nl: [
    'za 6 maart 2027',
    'za 6 – zo 7 maart 2027',
    'za 6 maart – vr 2 april 2027',
    'vr 31 december 2027 – zo 2 januari 2028',
  ],
  pl: [
    'sob., 6 marca 2027',
    'sob., 6 marca – niedz., 7 marca 2027',
    'sob., 6 marca – pt., 2 kwietnia 2027',
    'pt., 31 grudnia 2027 – niedz., 2 stycznia 2028',
  ],
  pt: [
    'sábado, 6 de março de 2027',
    'sábado, 6 de março de 2027 – domingo, 7 de março de 2027',
    'sábado, 6 de março de 2027 – sexta, 2 de abril de 2027',
    'sexta, 31 de dezembro de 2027 – domingo, 2 de janeiro de 2028',
  ],
  'pt-BR': [
    'sáb., 6 de março de 2027',
    'sáb., 6 de março – dom., 7 de março de 2027',
    'sáb., 6 de março – sex., 2 de abril de 2027',
    'sex., 31 de dezembro de 2027 – dom., 2 de janeiro de 2028',
  ],
  ru: [
    'сб, 6 марта 2027 г.',
    'сб, 6 – вс, 7 марта 2027 г.',
    'сб, 6 марта – пт, 2 апреля 2027 г.',
    'пт, 31 декабря 2027 г. – вс, 2 января 2028 г.',
  ],
  sv: [
    'lör 6 mars 2027',
    'lör 6 mars 2027–sön 7 mars 2027',
    'lör 6 mars 2027–fre 2 april 2027',
    'fre 31 december 2027–sön 2 januari 2028',
  ],
  tr: [
    '6 Mart 2027 Cmt',
    '6 Mart 2027 Cmt – 7 Mart 2027 Paz',
    '6 Mart 2027 Cmt – 2 Nisan 2027 Cum',
    '31 Aralık 2027 Cum – 2 Ocak 2028 Paz',
  ],
  uk: [
    'сб, 6 березня 2027 р.',
    'сб, 6 – нд, 7 березня 2027 р.',
    'сб, 6 березня – пт, 2 квітня 2027 р.',
    'пт, 31 грудня 2027 – нд, 2 січня 2028 рр.',
  ],
  ur: [
    'ہفتہ، 6 مارچ، 2027',
    'ہفتہ، 6 مارچ – اتوار، 7 مارچ، 2027',
    'ہفتہ، 6 مارچ – جمعہ، 2 اپریل، 2027',
    'جمعہ، 31 دسمبر، 2027 – اتوار، 2 جنوری، 2028',
  ],
  vi: [
    'Thứ 7, 6 tháng 3, 2027',
    'Thứ 7, 6 tháng 3 – CN, 7 tháng 3, 2027',
    'Thứ 7, 6 tháng 3 – Thứ 6, 2 tháng 4, 2027',
    'Thứ 6, 31 tháng 12, 2027 – CN, 2 tháng 1, 2028',
  ],
  'zh-Hans': [
    '2027年3月6日周六',
    '2027年3月6日周六至3月7日周日',
    '2027年3月6日周六至4月2日周五',
    '2027年12月31日周五至2028年1月2日周日',
  ],
  'zh-Hant': [
    '2027年3月6日週六',
    '2027年3月6日週六至3月7日週日',
    '2027年3月6日週六至4月2日週五',
    '2027年12月31日週五至2028年1月2日週日',
  ],
};

describe('formatDayRange in every language', () => {
  it('writes a day and blocks of days the way each language writes them', () => {
    const pairs = [
      ['2027-03-06', '2027-03-06'],
      ['2027-03-06', '2027-03-07'],
      ['2027-03-06', '2027-04-02'],
      ['2027-12-31', '2028-01-02'],
    ] as const;
    for (const language of LANGUAGES) {
      const written = pairs.map(([start, end]) =>
        // ICU writes narrow no-break spaces in some locales.
        formatDayRange(start, end, LOCALES[language]).replace(
          /[\s\u202f]+/g,
          ' '
        )
      );
      expect(written, language).toEqual(DAY_RANGES[language]);
    }
  });

  it('does not zero-pad a day in any language', () => {
    for (const language of LANGUAGES) {
      const text = formatDayRange(
        '2027-03-06',
        '2027-03-07',
        LOCALES[language]
      );
      expect(text, language).not.toMatch(/(^|\D)0\d(\D|$)/);
    }
  });
});

describe('pluralForm', () => {
  const forms = {
    zero: 'zero',
    one: 'one',
    two: 'two',
    few: 'few',
    many: 'many',
    other: 'other',
  };

  it('follows the plural rules of the language', () => {
    expect(
      [0, 1, 2, 3, 5, 11, 21, 22, 101].map((n) => pluralForm('en', n, forms))
    ).toEqual([
      'other',
      'one',
      'other',
      'other',
      'other',
      'other',
      'other',
      'other',
      'other',
    ]);
    expect(
      [0, 1, 2, 3, 5, 11, 21, 22, 101].map((n) => pluralForm('ru', n, forms))
    ).toEqual([
      'many',
      'one',
      'few',
      'few',
      'many',
      'many',
      'one',
      'few',
      'one',
    ]);
    expect(
      [0, 1, 2, 3, 5, 11, 21, 22, 101].map((n) => pluralForm('ar', n, forms))
    ).toEqual([
      'zero',
      'one',
      'two',
      'few',
      'few',
      'many',
      'many',
      'many',
      'other',
    ]);
    expect([0, 1, 2, 5].map((n) => pluralForm('ja', n, forms))).toEqual([
      'other',
      'other',
      'other',
      'other',
    ]);
  });

  it('falls back to other for a category the forms leave out', () => {
    expect(pluralForm('ru', 5, { one: 'a', other: 'b' })).toBe('b');
    expect(pluralForm('ar', 0, { one: 'a', other: 'b' })).toBe('b');
  });
});

describe('the server texts read right for every count', () => {
  const counts = [0, 1, 2, 3, 5, 11, 21, 22, 101];
  // The noun phrase each count asks for, where the language has more than one.
  const expected: Partial<
    Record<Language, { answers: string[]; days: string[] }>
  > = {
    ar: {
      answers: [
        '',
        'إجابة واحدة (1) حتى الآن',
        'إجابتان (2) حتى الآن',
        '3 إجابات حتى الآن',
        '5 إجابات حتى الآن',
        '11 إجابة حتى الآن',
        '21 إجابة حتى الآن',
        '22 إجابة حتى الآن',
        '101 إجابة حتى الآن',
      ],
      days: [
        '0 يوم آخر',
        'يوم آخر (1)',
        'يومان آخران (2)',
        '3 أيام أخرى',
        '5 أيام أخرى',
        '11 يوماً آخر',
        '21 يوماً آخر',
        '22 يوماً آخر',
        '101 يوم آخر',
      ],
    },
    cs: {
      answers: [
        '',
        ...[
          '1 odpověď',
          '2 odpovědi',
          '3 odpovědi',
          '5 odpovědí',
          '11 odpovědí',
          '21 odpovědí',
          '22 odpovědí',
          '101 odpovědí',
        ],
      ],
      days: [
        '0 dalších dní',
        '1 další den',
        '2 další dny',
        '3 další dny',
        '5 dalších dní',
        '11 dalších dní',
        '21 dalších dní',
        '22 dalších dní',
        '101 dalších dní',
      ],
    },
    pl: {
      answers: [
        '',
        '1 odpowiedź',
        '2 odpowiedzi',
        '3 odpowiedzi',
        '5 odpowiedzi',
        '11 odpowiedzi',
        '21 odpowiedzi',
        '22 odpowiedzi',
        '101 odpowiedzi',
      ],
      days: [
        '0 dni',
        '1 dzień',
        '2 dni',
        '3 dni',
        '5 dni',
        '11 dni',
        '21 dni',
        '22 dni',
        '101 dni',
      ],
    },
    ru: {
      answers: [
        '',
        '1 ответ',
        '2 ответа',
        '3 ответа',
        '5 ответов',
        '11 ответов',
        '21 ответ',
        '22 ответа',
        '101 ответ',
      ],
      days: [
        '0 дней',
        '1 день',
        '2 дня',
        '3 дня',
        '5 дней',
        '11 дней',
        '21 день',
        '22 дня',
        '101 день',
      ],
    },
    uk: {
      answers: [
        '',
        '1 відповідь',
        '2 відповіді',
        '3 відповіді',
        '5 відповідей',
        '11 відповідей',
        '21 відповідь',
        '22 відповіді',
        '101 відповідь',
      ],
      days: [
        '0 днів',
        '1 день',
        '2 дні',
        '3 дні',
        '5 днів',
        '11 днів',
        '21 день',
        '22 дні',
        '101 день',
      ],
    },
    en: {
      answers: [
        '',
        '1 answer',
        '2 answers',
        '3 answers',
        '5 answers',
        '11 answers',
        '21 answers',
        '22 answers',
        '101 answers',
      ],
      days: [
        '0 more days',
        '1 more day',
        '2 more days',
        '3 more days',
        '5 more days',
        '11 more days',
        '21 more days',
        '22 more days',
        '101 more days',
      ],
    },
    de: {
      answers: [
        '',
        '1 Antwort',
        '2 Antworten',
        '3 Antworten',
        '5 Antworten',
        '11 Antworten',
        '21 Antworten',
        '22 Antworten',
        '101 Antworten',
      ],
      days: [
        '0 weitere Tage',
        '1 weiterer Tag',
        '2 weitere Tage',
        '3 weitere Tage',
        '5 weitere Tage',
        '11 weitere Tage',
        '21 weitere Tage',
        '22 weitere Tage',
        '101 weitere Tage',
      ],
    },
    fr: {
      answers: [
        '',
        '1 réponse',
        '2 réponses',
        '3 réponses',
        '5 réponses',
        '11 réponses',
        '21 réponses',
        '22 réponses',
        '101 réponses',
      ],
      days: [
        '0 autre jour',
        '1 autre jour',
        '2 autres jours',
        '3 autres jours',
        '5 autres jours',
        '11 autres jours',
        '21 autres jours',
        '22 autres jours',
        '101 autres jours',
      ],
    },
  };

  it('pins the languages with more than one plural form', () => {
    for (const [language, words] of Object.entries(expected) as [
      Language,
      { answers: string[]; days: string[] },
    ][]) {
      const texts = SERVER_TEXTS[language];
      counts.forEach((n, index) => {
        if (n > 0) {
          expect(texts.previewOpen(n), `${language} ${n}`).toContain(
            words.answers[index]
          );
        }
        expect(texts.previewMoreDays(n), `${language} ${n}`).toContain(
          words.days[index]
        );
      });
    }
  });

  it('writes the count in every language, in Persian digits for Persian', () => {
    for (const language of LANGUAGES) {
      const texts = SERVER_TEXTS[language];
      expect(texts.previewOpen(0), language).not.toMatch(/[\d۰-۹]/);
      for (const n of counts.filter((count) => count > 0)) {
        const digits = language === 'fa' ? persianNumber.format(n) : String(n);
        expect(texts.previewOpen(n), `${language} ${n}`).toContain(digits);
      }
      for (const n of counts) {
        const digits = language === 'fa' ? persianNumber.format(n) : String(n);
        const more = texts.previewMoreDays(n);
        expect(more, `${language} ${n}`).toContain(digits);
        expect(more, `${language} ${n}`).not.toMatch(/undefined|NaN/);
      }
    }
  });
});
