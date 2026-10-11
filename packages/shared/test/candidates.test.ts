import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  checkCandidateDays,
  expandRange,
  forgetChangedWeekdays,
  keepChosenDays,
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
    expect(checkCandidateDays(['2026-10-01', '2026-10-09'], today)).toBe(
      'past'
    );
    expect(checkCandidateDays(['2026-10-02', '2027-10-03'], today)).toBe(
      'span'
    );
  });

  it('allows the earliest day and the longest span, refuses one more', () => {
    expect(checkCandidateDays([today], today)).toBeNull();
    const start = '2027-01-01';
    expect(
      checkCandidateDays([start, addDays(start, LIMITS.span - 1)], today)
    ).toBeNull();
    expect(
      checkCandidateDays([start, addDays(start, LIMITS.span)], today)
    ).toBe('span');
  });

  it('allows past days when editing', () => {
    expect(checkCandidateDays(['2020-01-01', '2020-01-02'], null)).toBeNull();
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

describe('checkCandidateDays with a latest day', () => {
  it('allows the latest day and refuses the day after', () => {
    expect(checkCandidateDays(['2027-03-05'], null, '2027-03-05')).toBeNull();
    expect(
      checkCandidateDays(['2027-03-05', '2027-03-06'], null, '2027-03-05')
    ).toBe('too_far');
  });

  it('checks the past before the future, and ignores a missing bound', () => {
    expect(
      checkCandidateDays(
        ['2027-03-01', '2027-03-09'],
        '2027-03-02',
        '2027-03-08'
      )
    ).toBe('past');
    expect(checkCandidateDays(['9999-12-31'], null)).toBeNull();
    expect(checkCandidateDays(['9999-12-31'], null, null)).toBeNull();
  });

  it('reaches about five years ahead', () => {
    expect(LIMITS.horizon).toBeGreaterThanOrEqual(5 * 365);
    expect(addDays('2027-03-01', LIMITS.horizon) > '2032-02-28').toBe(true);
  });
});

describe('expandRange with days that are no dates', () => {
  it('throws for an invalid day, whichever bound it is and however it sorts', () => {
    expect(() => expandRange('2027-03-01', '2027-02-30')).toThrow(RangeError);
    expect(() => expandRange('2027-02-30', '2027-03-05')).toThrow(RangeError);
    expect(() => expandRange('zzzz', '2027-03-05')).toThrow(RangeError);
    expect(() => expandRange('2027-03-05', 'zzzz')).toThrow(RangeError);
    expect(() => expandRange('', '')).toThrow(RangeError);
  });

  it('still gives one day for equal bounds and nothing for a reversed range', () => {
    expect(expandRange('2027-03-05', '2027-03-05')).toEqual(['2027-03-05']);
    expect(expandRange('2027-03-05', '2027-03-01')).toEqual([]);
  });
});

describe('keepChosenDays', () => {
  const range = expandRange('2026-10-05', '2026-10-11');
  const all = new Set(range);
  const none = new Set<string>();

  it('follows the weekday rule while nothing has been seen', () => {
    const automatic = new Set(
      expandRange('2026-10-05', '2026-10-11', FRI_TO_SUN)
    );
    expect(keepChosenDays(range, automatic, none, none)).toEqual([
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
  });

  it('gives exactly the painted days for the range they were painted in', () => {
    const chosen = new Set(['2026-10-05', '2026-10-08', '2026-10-11']);
    expect(keepChosenDays(range, all, chosen, all)).toEqual([...chosen]);
  });

  it('keeps an empty painting empty', () => {
    expect(keepChosenDays(range, all, none, all)).toEqual([]);
  });

  it('gives nothing for an empty range', () => {
    expect(keepChosenDays([], all, all, all)).toEqual([]);
  });

  it('keeps the shared days and adds the new ones when the range grows at both ends', () => {
    const chosen = new Set(['2026-10-05', '2026-10-11']);
    const wider = expandRange('2026-10-03', '2026-10-13');
    expect(keepChosenDays(wider, new Set(wider), chosen, all)).toEqual([
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
    ]);
  });

  it('keeps the painting of what is left when the range shrinks', () => {
    const chosen = new Set(['2026-10-05', '2026-10-07', '2026-10-09']);
    const narrower = expandRange('2026-10-06', '2026-10-08');
    expect(keepChosenDays(narrower, new Set(narrower), chosen, all)).toEqual([
      '2026-10-07',
    ]);
  });

  it('starts over by the weekday rule for a range that shares no day', () => {
    const later = expandRange('2026-10-12', '2026-10-18');
    expect(keepChosenDays(later, new Set(later), none, all)).toEqual(later);
  });

  it('keeps a seen day as painted and an unseen day by the rule, whatever the sets', () => {
    const days = expandRange('2026-10-01', '2026-10-20');
    const subset = fc.subarray(days).map((list) => new Set(list));
    fc.assert(
      fc.property(
        fc.subarray(days),
        subset,
        subset,
        subset,
        (inRange, automatic, chosen, seen) => {
          const result = keepChosenDays(inRange, automatic, chosen, seen);
          expect(result).toEqual(
            inRange.filter((day) =>
              seen.has(day) ? chosen.has(day) : automatic.has(day)
            )
          );
          expect([...result].sort()).toEqual(result);
          for (const day of result) expect(inRange).toContain(day);
        }
      )
    );
  });
});

describe('forgetChangedWeekdays', () => {
  // Monday 5 to Sunday 11 October 2026; weekday 0 is Monday.
  const week = new Set(expandRange('2026-10-05', '2026-10-11'));
  const FRIDAY = new Set<Weekday>([4]);
  const FRI_SAT = new Set<Weekday>([4, 5]);

  it('forgets only the days of a weekday that is added or taken away', () => {
    expect([...forgetChangedWeekdays(week, FRIDAY, FRI_SAT)]).toEqual(
      [...week].filter((day) => day !== '2026-10-10')
    );
    expect([...forgetChangedWeekdays(week, FRI_SAT, FRIDAY)]).toEqual(
      [...week].filter((day) => day !== '2026-10-10')
    );
  });

  it('keeps the picked weekday and forgets the rest when the first one is picked', () => {
    expect([...forgetChangedWeekdays(week, new Set(), FRIDAY)]).toEqual([
      '2026-10-09',
    ]);
  });

  it('keeps the last weekday and forgets the rest when it is dropped', () => {
    expect([...forgetChangedWeekdays(week, FRIDAY, new Set())]).toEqual([
      '2026-10-09',
    ]);
  });

  it('forgets nothing when the weekdays stay the same', () => {
    expect(forgetChangedWeekdays(week, FRI_SAT, FRI_SAT)).toEqual(week);
    expect(forgetChangedWeekdays(week, new Set(), new Set())).toEqual(week);
  });

  it('gives nothing for nothing seen', () => {
    expect(forgetChangedWeekdays(new Set(), new Set(), FRIDAY).size).toBe(0);
  });

  it('keeps a day exactly when its weekday is allowed the same before and after', () => {
    const days = expandRange('2026-10-01', '2026-10-28');
    const weekdays = fc
      .subarray<Weekday>([0, 1, 2, 3, 4, 5, 6])
      .map((list) => new Set(list));
    fc.assert(
      fc.property(
        fc.subarray(days),
        weekdays,
        weekdays,
        (seen, before, after) => {
          const kept = forgetChangedWeekdays(new Set(seen), before, after);
          const automatic = (set: ReadonlySet<Weekday>) =>
            new Set(expandRange('2026-10-01', '2026-10-28', set));
          const was = automatic(before);
          const is = automatic(after);
          for (const day of seen)
            expect(kept.has(day)).toBe(was.has(day) === is.has(day));
          for (const day of kept) expect(seen).toContain(day);
        }
      )
    );
  });
});
