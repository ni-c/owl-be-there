import { LIMITS, type ISODate } from '@owl/shared';
import { describe, expect, it } from 'vitest';
import {
  asciiDigits,
  changedFields,
  checkDetails,
  checkMinCount,
  checkTitle,
  invisibleProblem,
  detailsOf,
  hasUnsavedDetails,
  inputOf,
  parseRoster,
  type DetailsInput,
  type DetailsValues,
} from '../src/lib/forms.ts';

const days: ISODate[] = [
  '2027-03-05',
  '2027-03-06',
  '2027-03-07',
  '2027-03-20',
];
const input: DetailsInput = {
  title: 'Dinner',
  description: '',
  location: '',
  creatorName: '',
  emoji: 'owl',
  minCount: '',
  duration: '1',
};
const seed: DetailsValues = {
  title: 'Dinner',
  description: null,
  location: null,
  creatorName: null,
  emoji: 'owl',
  minCount: null,
  durationDays: 1,
};

describe('checkDetails', () => {
  it('accepts the form as it starts and empties become null', () => {
    expect(checkDetails(inputOf(seed), days)).toEqual({
      ok: true,
      values: seed,
    });
  });

  it('trims the text and keeps the numbers', () => {
    const check = checkDetails(
      {
        ...input,
        title: '  Dinner ',
        description: ' Bring food ',
        location: '   ',
        minCount: '4',
        duration: '3',
      },
      days
    );
    expect(check).toEqual({
      ok: true,
      values: {
        ...seed,
        description: 'Bring food',
        minCount: 4,
        durationDays: 3,
      },
    });
  });

  it('refuses an empty or blank title', () => {
    for (const title of ['', '   ']) {
      const check = checkDetails({ ...input, title }, days);
      expect(check.ok).toBe(false);
      if (!check.ok)
        expect(check.errors.title?.key).toBe('error.titleRequired');
    }
  });

  it('refuses a duration that is empty or out of range instead of nudging it', () => {
    for (const duration of ['', '0', '15', '00']) {
      const check = checkDetails({ ...input, duration }, days);
      expect(check.ok, duration).toBe(false);
      if (!check.ok)
        expect(check.errors.duration, duration).toEqual({
          key: 'error.numberRange',
          params: { min: 1, max: LIMITS.durationDays },
        });
    }
    for (const duration of ['1', '3', '14']) {
      const check = checkDetails({ ...input, duration }, [
        ...days,
        ...Array.from(
          { length: 14 },
          (_, i) => `2027-04-${String(i + 1).padStart(2, '0')}`
        ),
      ]);
      expect(check.ok, duration).toBe(true);
    }
  });

  it('wants a run of the duration among the days', () => {
    const check = checkDetails({ ...input, duration: '4' }, days);
    expect(check).toEqual({
      ok: false,
      errors: { duration: { key: 'error.noBlock', params: { count: 4 } } },
    });
  });

  it('treats an empty number of people as none and refuses what is out of range', () => {
    expect(checkMinCount('')).toEqual({ value: null, problem: null });
    expect(checkMinCount('  ')).toEqual({ value: null, problem: null });
    expect(checkMinCount('1').value).toBe(1);
    expect(checkMinCount(String(LIMITS.participants)).value).toBe(
      LIMITS.participants
    );
    for (const text of [
      '0',
      String(LIMITS.participants + 1),
      '1.5',
      '-1',
      'x',
    ]) {
      const result = checkMinCount(text);
      expect(result.value, text).toBeNull();
      expect(result.problem?.key, text).toBe('error.numberRange');
    }
    const check = checkDetails({ ...input, minCount: '0' }, days);
    expect(check.ok).toBe(false);
  });

  it('reports every problem at once', () => {
    const check = checkDetails(
      { ...input, title: '', minCount: '0', duration: '' },
      days
    );
    expect(check.ok).toBe(false);
    if (!check.ok)
      expect(Object.keys(check.errors).sort()).toEqual([
        'duration',
        'minCount',
        'title',
      ]);
  });
});

describe('changedFields', () => {
  it('is empty when nothing changed', () => {
    expect(changedFields(seed, { ...seed })).toEqual({});
  });

  it('holds only what was edited', () => {
    expect(changedFields(seed, { ...seed, title: 'Lunch' })).toEqual({
      title: 'Lunch',
    });
    expect(
      changedFields(seed, { ...seed, durationDays: 2, emoji: 'soccer' })
    ).toEqual({
      durationDays: 2,
      emoji: 'soccer',
    });
  });

  it('carries a field that was emptied as null', () => {
    const had = { ...seed, minCount: 5, location: 'Park' };
    expect(
      changedFields(had, { ...had, minCount: null, location: null })
    ).toEqual({ minCount: null, location: null });
  });

  it('does not put back what changed elsewhere', () => {
    // The form started with duration 1; the phone made it 2; only the title is edited here.
    const edited = { ...seed, title: 'Dinner!' };
    expect(changedFields(seed, edited)).toEqual({ title: 'Dinner!' });
  });
});

describe('detailsOf', () => {
  it('reads the details out of an event and the form is made from them', () => {
    const event = {
      id: 'abc',
      title: 'Dinner',
      description: 'Bring food',
      location: null,
      emoji: 'owl' as const,
      creatorName: 'Max',
      language: 'en' as const,
      durationDays: 2,
      minCount: 3,
      status: 'open' as const,
      finalStart: null,
      finalEnd: null,
      expiresOn: '2027-06-01',
      version: 1,
      days,
    };
    const values = detailsOf(event);
    expect(values).toEqual({
      title: 'Dinner',
      description: 'Bring food',
      location: null,
      creatorName: 'Max',
      emoji: 'owl',
      minCount: 3,
      durationDays: 2,
    });
    expect(inputOf(values)).toEqual({
      title: 'Dinner',
      description: 'Bring food',
      location: '',
      creatorName: 'Max',
      emoji: 'owl',
      minCount: '3',
      duration: '2',
    });
  });
});

describe('parseRoster', () => {
  it('reads one name per line and ignores blank lines', () => {
    expect(parseRoster('Anna\n\n  Ben  \n   \nCarla')).toEqual({
      names: ['Anna', 'Ben', 'Carla'],
      problem: null,
    });
    expect(parseRoster('')).toEqual({ names: [], problem: null });
    expect(parseRoster(' \n \n')).toEqual({ names: [], problem: null });
  });

  it('accepts a name of exactly the limit and refuses one more', () => {
    expect(parseRoster('a'.repeat(LIMITS.name)).problem).toBeNull();
    expect(parseRoster(`Anna\n${'a'.repeat(LIMITS.name + 1)}`).problem).toEqual(
      {
        key: 'error.rosterLine',
        params: { max: LIMITS.name },
      }
    );
  });

  it('counts characters, not UTF-16 units', () => {
    expect(parseRoster('🦉'.repeat(LIMITS.name)).problem).toBeNull();
    expect(parseRoster('🦉'.repeat(LIMITS.name + 1)).problem?.key).toBe(
      'error.rosterLine'
    );
  });

  it('refuses a longer list instead of cutting it off', () => {
    const names = (count: number) =>
      Array.from({ length: count }, (_, i) => `P${i}`).join('\n');
    const exact = parseRoster(names(LIMITS.roster));
    expect(exact.problem).toBeNull();
    expect(exact.names).toHaveLength(LIMITS.roster);
    const over = parseRoster(names(LIMITS.roster + 1));
    expect(over.problem).toEqual({
      key: 'error.rosterTooMany',
      params: { max: LIMITS.roster },
    });
    expect(over.names).toHaveLength(LIMITS.roster + 1);
  });
});

describe('invisible and mixed-script text, as the server refuses it', () => {
  const FILLER = '\u3164';
  const lookalike = 'M\u0430x'; // Latin M and x around a Cyrillic а

  it('names the line of a roster entry with nothing visible', () => {
    expect(parseRoster(`Anna\n${FILLER}`).problem).toEqual({
      key: 'error.rosterInvisible',
      params: { line: 2 },
    });
    expect(parseRoster('\u200b').problem?.key).toBe('error.rosterInvisible');
  });

  it('names the line of a mixed-script word, counting empty lines', () => {
    expect(parseRoster(`Anna\n\n${lookalike}`).problem).toEqual({
      key: 'error.rosterMixed',
      params: { line: 3 },
    });
    expect(parseRoster('Ηλίας Smith\nΑλέξης').problem).toBeNull();
    expect(parseRoster('Иван Smith').problem).toBeNull();
    expect(parseRoster('Μaria').problem?.key).toBe('error.rosterMixed');
  });

  it('reports the first bad line and lets a too long list win', () => {
    expect(parseRoster(`${lookalike}\n${FILLER}`).problem?.params).toEqual({
      line: 1,
    });
    const many = Array.from({ length: LIMITS.roster }, (_, i) => `P${i}`);
    expect(parseRoster([...many, FILLER].join('\n')).problem?.key).toBe(
      'error.rosterTooMany'
    );
  });

  it('cleans each name the way the server does before it is sent', () => {
    expect(parseRoster('  Anna   Lee ').names).toEqual(['Anna Lee']);
  });

  it('refuses a title that is only invisible, apart from an empty one', () => {
    expect(checkTitle('')?.key).toBe('error.titleRequired');
    expect(checkTitle('   ')?.key).toBe('error.titleRequired');
    expect(checkTitle(FILLER)?.key).toBe('error.textInvisible');
    expect(checkTitle(`${FILLER} x`)).toBeNull();
    expect(checkTitle('Dinner')).toBeNull();
  });

  it('lets an empty optional line pass but not an invisible one', () => {
    expect(invisibleProblem('')).toBeNull();
    expect(invisibleProblem('   ')).toBeNull();
    expect(invisibleProblem(FILLER)?.key).toBe('error.textInvisible');
  });

  it('checks title, location and creator name in the details', () => {
    const check = checkDetails(
      { ...input, title: FILLER, location: FILLER, creatorName: FILLER },
      days
    );
    expect(check.ok).toBe(false);
    if (!check.ok)
      expect(Object.keys(check.errors).sort()).toEqual([
        'creatorName',
        'location',
        'title',
      ]);
  });

  it('sends the cleaned text, so an unchanged field is not a change', () => {
    const check = checkDetails(
      { ...input, title: ' Dinner  ', location: ' Pub   Row ' },
      days
    );
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.values.title).toBe('Dinner');
      expect(check.values.location).toBe('Pub Row');
      expect(changedFields(seed, check.values)).toEqual({
        location: 'Pub Row',
      });
    }
  });
});

describe('asciiDigits', () => {
  it('turns Persian and Arabic-Indic digits into ASCII ones', () => {
    expect(asciiDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(asciiDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(asciiDigits('۱2٣')).toBe('123');
  });

  it('drops everything that is no digit and keeps the empty string', () => {
    expect(asciiDigits('')).toBe('');
    expect(asciiDigits('1a-2 ٣x۴.')).toBe('1234');
    expect(asciiDigits('abc')).toBe('');
    // Other scripts' digits and look-alikes are not numbers here.
    expect(asciiDigits('१२')).toBe('');
    expect(asciiDigits('１２')).toBe('');
  });

  it('feeds the number checks', () => {
    expect(checkMinCount(asciiDigits('۵')).value).toBe(5);
    expect(checkMinCount(asciiDigits('۰')).problem?.key).toBe(
      'error.numberRange'
    );
  });
});

describe('hasUnsavedDetails', () => {
  const seed = {
    title: 'Dinner',
    description: null,
    location: null,
    creatorName: null,
    emoji: 'owl' as const,
    minCount: null,
    durationDays: 1,
  };
  const days = ['2027-03-06'];

  it('is false for the form as loaded, and for a change typed back', () => {
    expect(hasUnsavedDetails(seed, inputOf(seed), days)).toBe(false);
    expect(
      hasUnsavedDetails(seed, { ...inputOf(seed), title: 'Dinner ' }, days)
    ).toBe(false);
  });

  it('is true for a valid change', () => {
    expect(
      hasUnsavedDetails(seed, { ...inputOf(seed), location: 'Pub' }, days)
    ).toBe(true);
  });

  it('is true for an invalid input that differs, false for an invalid one that is the load', () => {
    expect(hasUnsavedDetails(seed, { ...inputOf(seed), title: '' }, days)).toBe(
      true
    );
    const bad = { ...seed, title: '' };
    expect(hasUnsavedDetails(bad, inputOf(bad), days)).toBe(false);
  });
});
