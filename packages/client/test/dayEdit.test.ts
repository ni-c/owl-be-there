import {
  addDays,
  expandRange,
  LIMITS,
  type ISODate,
  type Mark,
} from '@owl/shared';
import { describe, expect, it } from 'vitest';
import {
  daysProblem,
  daysToSave,
  extendSelection,
  isLossy,
  savingImpact,
  visibleRange,
} from '../src/lib/dayEdit.ts';

const march = (day: number): ISODate =>
  `2027-03-${String(day).padStart(2, '0')}`;
const all = (days: readonly ISODate[]) =>
  new Map<ISODate, Mark>(days.map((day) => [day, 'yes']));
const sorted = (map: ReadonlyMap<ISODate, Mark>) => [...map.keys()].sort();

describe('daysProblem', () => {
  it('asks for at least one day', () => {
    expect(daysProblem([], 1)?.key).toBe('error.noDays');
  });

  it('accepts exactly as many days as an event may hold and refuses one more', () => {
    const days = expandRange(
      '2027-01-01',
      addDays('2027-01-01', LIMITS.days - 1)
    );
    expect(daysProblem(days, 1)).toBeNull();
    const more = expandRange('2027-01-01', addDays('2027-01-01', LIMITS.days));
    expect(daysProblem(more, 1)).toEqual({
      key: 'error.tooManyDays',
      params: { max: LIMITS.days },
    });
  });

  it('wants a run of the duration in a row', () => {
    const days = [5, 6, 7, 20].map(march);
    expect(daysProblem(days, 3)).toBeNull();
    expect(daysProblem(days, 4)).toEqual({
      key: 'error.noBlock',
      params: { count: 4 },
    });
    // One day at a time needs nothing but a day.
    expect(daysProblem([march(20)], 1)).toBeNull();
    expect(daysProblem([march(5), march(20)], 1)).toBeNull();
  });
});

describe('visibleRange', () => {
  const first = march(5);
  const last = march(7);

  it('shows the existing days when the end is not later', () => {
    expect(visibleRange(first, last, march(7))).toEqual([5, 6, 7].map(march));
    expect(visibleRange(first, last, march(6))).toEqual([5, 6, 7].map(march));
    expect(visibleRange(first, last, '')).toEqual([5, 6, 7].map(march));
    expect(visibleRange(first, last, '2027-3-9')).toEqual([5, 6, 7].map(march));
  });

  it('extends up to the end and stops at what an event may span', () => {
    expect(visibleRange(first, last, march(9))).toEqual(
      [5, 6, 7, 8, 9].map(march)
    );
    const far = visibleRange(first, last, '2031-01-01');
    expect(far).toHaveLength(LIMITS.span);
    expect(far[0]).toBe(first);
  });
});

describe('extendSelection', () => {
  const first = march(5);
  const last = march(7);
  const today = march(1);
  const base = all([5, 6, 7].map(march));
  const extend = (until: string, from = base) =>
    extendSelection(from, { first, last, until, today });

  it('adds the days up to the date and drops them again when it moves back', () => {
    const far = extend('2027-04-07');
    expect(far.size).toBe(34);
    const nearer = extend('2027-04-03', far);
    expect(nearer.size).toBe(30);
    expect(sorted(nearer).at(-1)).toBe('2027-04-03');
    expect(sorted(nearer).at(-2)).toBe('2027-04-02');
  });

  it('returns to the original days when the date is the last day, earlier or no date', () => {
    const far = extend('2027-04-07');
    expect(sorted(extend(last, far))).toEqual([5, 6, 7].map(march));
    expect(sorted(extend(march(6), far))).toEqual([5, 6, 7].map(march));
    expect(sorted(extend('', far))).toEqual([5, 6, 7].map(march));
  });

  it('keeps a day the organiser switched off', () => {
    const edited = new Map(base);
    edited.delete(march(6));
    expect(sorted(extend(march(9), edited))).toEqual([5, 7, 8, 9].map(march));
  });

  it('never holds more days than an event may', () => {
    const grown = extend('2029-01-01');
    expect(grown.size).toBe(LIMITS.days);
    // Exactly the limit stays as it is, and adds nothing more.
    expect(extend('2029-06-01', grown).size).toBe(LIMITS.days);
    // Just short of the limit fills up to it.
    const days = expandRange(first, addDays(first, LIMITS.days - 3));
    const nearly = extendSelection(all(days), {
      first,
      last: days.at(-1)!,
      until: '2029-01-01',
      today,
    });
    expect(nearly.size).toBe(LIMITS.days);
  });

  it('adds no day that has passed', () => {
    const past = { first: '2027-02-01', last: '2027-02-10', today: march(1) };
    const from = all(expandRange(past.first, past.last));
    const grown = extendSelection(from, { ...past, until: march(4) });
    expect(sorted(grown).slice(10)).toEqual([1, 2, 3, 4].map(march));
    // From yesterday on, today is the first to add.
    const edge = extendSelection(from, {
      ...past,
      last: '2027-02-28',
      until: march(2),
    });
    expect(sorted(edge).slice(-2)).toEqual([march(1), march(2)]);
    // A date before today adds nothing.
    expect(extendSelection(from, { ...past, until: '2027-02-20' }).size).toBe(
      10
    );
    // Days ahead of today carry on from the last day as before.
    const ahead = extendSelection(all([march(5), march(6)]), {
      first: march(5),
      last: march(6),
      until: march(8),
      today,
    });
    expect(sorted(ahead)).toEqual([5, 6, 7, 8].map(march));
  });

  it('never reaches past the horizon', () => {
    const farToday = '2027-03-01';
    const grown = extendSelection(base, {
      first,
      last,
      until: '2035-01-01',
      today: farToday,
    });
    expect(sorted(grown).at(-1)! <= addDays(farToday, LIMITS.horizon)).toBe(
      true
    );
  });
});

describe('daysToSave', () => {
  it('is what the calendar shows and has selected, in order', () => {
    const shown = [5, 6, 7, 8].map(march);
    const selection = all([8, 5, 7].map(march));
    expect(daysToSave(shown, selection)).toEqual([5, 7, 8].map(march));
  });

  it('leaves out days the calendar no longer shows', () => {
    const shown = [5, 6, 7].map(march);
    expect(daysToSave(shown, all([5, 6, 7, 20, 21].map(march)))).toEqual(shown);
  });

  it('is empty when nothing is selected', () => {
    expect(daysToSave([5, 6].map(march), new Map())).toEqual([]);
  });
});

describe('savingImpact', () => {
  const current = {
    days: [5, 6, 7, 8, 9, 10].map(march),
    durationDays: 1,
    finalStart: null,
    finalEnd: null,
  };
  const anna = { yes: [march(10), march(5)], maybe: [march(6)] };
  const ben = { yes: [march(10)], maybe: [march(10)] };

  it('counts the answers on removed days', () => {
    const next = { days: [5, 6, 7, 8, 9].map(march), durationDays: 1 };
    expect(savingImpact(current, [anna, ben], next)).toEqual({
      marks: 2,
      date: 'kept',
    });
  });

  it('counts a day in both lists once and finds the first and last day', () => {
    const next = { days: [6, 7, 8, 9].map(march), durationDays: 1 };
    // Anna: 5 and 10; Ben: 10 (yes and maybe both).
    expect(savingImpact(current, [anna, ben], next).marks).toBe(3);
  });

  it('is free when no answer is on a removed day or nobody has answered', () => {
    const next = { days: [5, 6, 7, 8, 9].map(march), durationDays: 1 };
    expect(savingImpact(current, [], next).marks).toBe(0);
    expect(
      savingImpact(current, [{ yes: [march(5)], maybe: [] }], next)
    ).toEqual({
      marks: 0,
      date: 'kept',
    });
    expect(isLossy({ marks: 0, date: 'kept' })).toBe(false);
  });

  it('adds nothing for days that are only added', () => {
    const next = { days: [...current.days, march(11)], durationDays: 1 };
    expect(savingImpact(current, [anna], next).marks).toBe(0);
  });

  describe('with a chosen date', () => {
    const chosen = {
      ...current,
      durationDays: 3,
      finalStart: march(6),
      finalEnd: march(8),
    };

    it('drops it when a day of it is removed, keeps it when another is', () => {
      const inside = { days: [5, 6, 8, 9, 10].map(march), durationDays: 3 };
      expect(savingImpact(chosen, [], inside).date).toBe('dropped');
      const outside = { days: [6, 7, 8, 9, 10].map(march), durationDays: 3 };
      expect(savingImpact(chosen, [], outside).date).toBe('kept');
    });

    it('drops it when a longer duration no longer fits, keeps it when it does', () => {
      const short = { days: [5, 6, 7, 8].map(march), durationDays: 4 };
      expect(savingImpact(chosen, [], short)).toEqual({
        marks: 0,
        date: 'dropped',
      });
      const longer = { days: current.days, durationDays: 4 };
      expect(savingImpact(chosen, [], longer).date).toBe('kept');
    });

    it('shortens it with a shorter duration', () => {
      const next = { days: current.days, durationDays: 2 };
      expect(savingImpact(chosen, [], next).date).toBe('shortened');
      expect(isLossy({ marks: 0, date: 'shortened' })).toBe(true);
    });

    it('is unchanged by the same duration and days', () => {
      expect(
        savingImpact(chosen, [anna], { days: current.days, durationDays: 3 })
      ).toEqual({ marks: 0, date: 'kept' });
    });

    it('names the answers as well as the date', () => {
      const next = { days: [5, 6, 7, 8, 9].map(march), durationDays: 3 };
      const impact = savingImpact(chosen, [anna], next);
      expect(impact).toEqual({ marks: 1, date: 'kept' });
      expect(isLossy(impact)).toBe(true);
    });
  });
});
