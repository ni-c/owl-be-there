import { LIMITS, type ISODate } from '@owl/shared';
import { describe, expect, it } from 'vitest';
import {
  changedFields,
  checkDetails,
  checkMinCount,
  detailsOf,
  inputOf,
  parseRoster,
  radioTarget,
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

describe('radioTarget', () => {
  const items = ['a', 'b', 'c'];

  it('moves to the next and previous item', () => {
    expect(radioTarget(items, 'a', 'ArrowRight')).toBe('b');
    expect(radioTarget(items, 'b', 'ArrowDown')).toBe('c');
    expect(radioTarget(items, 'c', 'ArrowLeft')).toBe('b');
    expect(radioTarget(items, 'b', 'ArrowUp')).toBe('a');
  });

  it('wraps at both ends', () => {
    expect(radioTarget(items, 'c', 'ArrowRight')).toBe('a');
    expect(radioTarget(items, 'a', 'ArrowLeft')).toBe('c');
  });

  it('ignores other keys, an unknown current item and an empty group', () => {
    expect(radioTarget(items, 'a', 'Enter')).toBeNull();
    expect(radioTarget(items, 'z', 'ArrowRight')).toBeNull();
    expect(radioTarget([], 'a', 'ArrowRight')).toBeNull();
    expect(radioTarget(['a'], 'a', 'ArrowRight')).toBe('a');
  });
});
