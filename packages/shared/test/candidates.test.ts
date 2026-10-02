import { describe, expect, it } from 'vitest';
import {
  addDays,
  checkCandidateDays,
  expandRange,
  LIMITS,
  normalizeDays,
  type Weekday,
} from '../src/index.js';

const FRI_TO_SUN = new Set<Weekday>([4, 5, 6]);

describe('expandRange', () => {
  it('lists every day, both ends included', () => {
    expect(expandRange('2026-10-02', '2026-10-04')).toEqual([
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });

  it('keeps only the chosen weekdays', () => {
    expect(expandRange('2026-10-02', '2026-10-11', FRI_TO_SUN)).toEqual([
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
  });

  it('treats an empty weekday set as every weekday', () => {
    expect(expandRange('2026-10-05', '2026-10-06', new Set())).toEqual([
      '2026-10-05',
      '2026-10-06',
    ]);
  });

  it('gives a single day for a one-day range', () => {
    expect(expandRange('2026-10-05', '2026-10-05')).toEqual(['2026-10-05']);
  });

  it('gives nothing for a reversed range', () => {
    expect(expandRange('2026-10-06', '2026-10-05')).toEqual([]);
  });

  it('gives nothing when no day in the range has a chosen weekday', () => {
    expect(expandRange('2026-10-05', '2026-10-07', FRI_TO_SUN)).toEqual([]);
  });

  it('accepts the longest span and refuses one day more', () => {
    const start = '2027-01-01';
    expect(expandRange(start, addDays(start, LIMITS.span - 1))).toHaveLength(
      LIMITS.span
    );
    expect(() => expandRange(start, addDays(start, LIMITS.span))).toThrow(
      RangeError
    );
  });

  it('crosses the turn of the year and the leap day', () => {
    expect(expandRange('2027-12-31', '2028-01-01')).toEqual([
      '2027-12-31',
      '2028-01-01',
    ]);
    expect(expandRange('2028-02-28', '2028-03-01')).toHaveLength(3);
  });
});

describe('checkCandidateDays', () => {
  const today = '2026-10-02';

  it('accepts a sorted list of future days', () => {
    expect(checkCandidateDays(['2026-10-02', '2026-10-09'], today)).toBeNull();
  });

  it('names each problem', () => {
    expect(checkCandidateDays([], today)).toBe('empty');
    expect(checkCandidateDays(['2026-02-30'], today)).toBe('invalid');
    expect(checkCandidateDays(['2026-10-09', '2026-10-09'], today)).toBe(
      'duplicate'
    );
    expect(checkCandidateDays(['2026-10-09', '2026-10-08'], today)).toBe(
      'unsorted'
    );
    expect(checkCandidateDays(['2026-10-01', '2026-10-09'], today)).toBe(
      'past'
    );
    expect(checkCandidateDays(['2026-10-02', '2027-10-03'], today)).toBe(
      'span'
    );
  });

  it('allows past days when editing', () => {
    expect(checkCandidateDays(['2020-01-01', '2020-01-02'], null)).toBeNull();
  });

  it('caps the number of days', () => {
    const days = expandRange('2027-01-01', addDays('2027-01-01', LIMITS.days));
    expect(days).toHaveLength(LIMITS.days + 1);
    expect(checkCandidateDays(days.slice(0, LIMITS.days), today)).toBeNull();
    expect(checkCandidateDays(days, today)).toBe('too_many');
  });
});

describe('normalizeDays', () => {
  it('sorts and removes duplicates', () => {
    expect(
      normalizeDays(['2026-10-09', '2026-10-02', '2026-10-09', '2025-12-31'])
    ).toEqual(['2025-12-31', '2026-10-02', '2026-10-09']);
    expect(normalizeDays([])).toEqual([]);
  });
});
