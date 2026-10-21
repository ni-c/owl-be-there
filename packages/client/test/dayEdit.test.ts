import {
  addDays,
  compareISODate,
  expandRange,
  LIMITS,
  type ISODate,
  type Mark,
} from '@owl/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  daysProblem,
  daysToSave,
  extendSelection,
  isLossy,
  latestCandidateDay,
  latestEditableDay,
  rangeProblemKey,
  sameDays,
  savingImpact,
  untilProblemKey,
  visibleRange,
  type SavingImpact,
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

describe('rangeProblemKey', () => {
  const today = march(10);
  const horizon = addDays(today, LIMITS.horizon);
  const problem = (from: string, to: string) =>
    rangeProblemKey(from, to, today);

  it('accepts a range that starts today and one that ends on the last day of the horizon', () => {
    expect(problem(today, today)).toBeNull();
    expect(problem(today, addDays(today, 1))).toBeNull();
    expect(problem(addDays(horizon, -3), horizon)).toBeNull();
    expect(problem(horizon, horizon)).toBeNull();
  });

  it('refuses a start before today, and only that one', () => {
    expect(problem(addDays(today, -1), addDays(today, 5))).toBe('error.past');
    expect(problem(addDays(today, -1), today)).toBe('error.past');
    expect(problem(addDays(today, -400), addDays(today, 5))).toBe('error.past');
  });

  it('refuses an end past the horizon, and only the day after it', () => {
    expect(problem(addDays(horizon, -2), addDays(horizon, 1))).toBe(
      'error.tooFar'
    );
    expect(problem(horizon, addDays(horizon, 1))).toBe('error.tooFar');
    expect(problem(addDays(horizon, 1), addDays(horizon, 1))).toBe(
      'error.tooFar'
    );
  });

  it('allows a span of exactly the limit and refuses one day more', () => {
    expect(problem(today, addDays(today, LIMITS.span - 1))).toBeNull();
    expect(problem(today, addDays(today, LIMITS.span))).toBe(
      'error.rangeTooLong'
    );
    // Away from today the same.
    const from = addDays(today, 100);
    expect(problem(from, addDays(from, LIMITS.span - 1))).toBeNull();
    expect(problem(from, addDays(from, LIMITS.span))).toBe(
      'error.rangeTooLong'
    );
  });

  it('says too far, not too long, when a long range also ends past the horizon', () => {
    expect(problem(addDays(horizon, -LIMITS.span), addDays(horizon, 1))).toBe(
      'error.tooFar'
    );
  });

  it('accepts a single day, from equal to to', () => {
    expect(problem(march(20), march(20))).toBeNull();
  });

  it('names an end before the start', () => {
    expect(problem(march(20), march(19))).toBe('error.range');
    expect(problem(march(20), march(11))).toBe('error.range');
  });

  // The one change from the wizard's earlier check, which looked at the limits
  // first: a reversed range is reported as reversed, even where a limit is
  // broken as well. Both texts were true; "the end comes before the start" is
  // the one that tells the organiser what to fix.
  it('names a reversed range before the limits it also breaks', () => {
    // Start in the past, end earlier still: was "error.past".
    expect(problem(addDays(today, -1), addDays(today, -2))).toBe('error.range');
    expect(problem(addDays(today, -1), addDays(today, -400))).toBe(
      'error.range'
    );
    // Start and end both past the horizon: was "error.tooFar".
    expect(problem(addDays(horizon, 5), addDays(horizon, 2))).toBe(
      'error.range'
    );
    // A reversed range inside the limits and one that touches today.
    expect(problem(addDays(today, 1), today)).toBe('error.range');
  });

  it('keeps the limits for a range that is not reversed', () => {
    // Start in the past with a later end: still "past".
    expect(problem(addDays(today, -2), addDays(today, -1))).toBe('error.past');
    // Start in the past with an end past the horizon: the start is named first.
    expect(problem(addDays(today, -1), addDays(horizon, 1))).toBe('error.past');
  });

  it('asks for days when either end is no date', () => {
    for (const [from, to] of [
      ['', march(20)],
      [march(20), ''],
      ['', ''],
      ['2027-02-30', march(20)],
      [march(20), '2027-13-01'],
      ['20270320', march(21)],
    ] as const) {
      expect(problem(from, to), `${from} to ${to}`).toBe('error.noDays');
    }
  });

  it('crosses a year end and a leap day like any other range', () => {
    const base = '2027-12-30';
    expect(rangeProblemKey(base, '2028-01-02', '2027-12-30')).toBeNull();
    expect(
      rangeProblemKey('2028-02-29', '2028-03-01', '2028-02-01')
    ).toBeNull();
    expect(rangeProblemKey('2028-03-01', '2028-02-29', '2028-02-01')).toBe(
      'error.range'
    );
  });
});

describe('visibleRange', () => {
  const first = march(5);
  const last = march(7);
  const today = march(1);

  it('shows the existing days when the end is not later', () => {
    const shown = (until: string) => visibleRange(first, last, until, today);
    expect(shown(march(7))).toEqual([5, 6, 7].map(march));
    expect(shown(march(6))).toEqual([5, 6, 7].map(march));
    expect(shown('')).toEqual([5, 6, 7].map(march));
    expect(shown('2027-3-9')).toEqual([5, 6, 7].map(march));
  });

  it('extends up to the end and stops at what an event may span', () => {
    expect(visibleRange(first, last, march(9), today)).toEqual(
      [5, 6, 7, 8, 9].map(march)
    );
    const far = visibleRange(first, last, '2031-01-01', today);
    expect(far).toHaveLength(LIMITS.span);
    expect(far[0]).toBe(first);
  });

  it('stops where extendSelection stops, at the horizon', () => {
    // The first day is so far ahead that the horizon comes before the span.
    const early = '2030-06-01';
    const late = addDays(early, LIMITS.span - 1);
    const lastEditable = latestEditableDay(early, '2026-01-01');
    expect(compareISODate(lastEditable, late)).toBeLessThan(0);
    const shown = visibleRange(early, early, late, '2026-01-01');
    expect(shown[shown.length - 1]).toBe(lastEditable);
    const selection = extendSelection(all([early]), {
      first: early,
      last: early,
      until: late,
      today: '2026-01-01',
    });
    // The selection is capped at LIMITS.days, but never reaches past the calendar.
    expect(sorted(selection).every((day) => shown.includes(day))).toBe(true);
  });

  it('never cuts the days that exist', () => {
    const past = '2026-01-01';
    expect(visibleRange(first, last, '', past)).toEqual([5, 6, 7].map(march));
  });
});

describe('latestCandidateDay and latestEditableDay', () => {
  it('reaches the horizon from today', () => {
    expect(latestCandidateDay(march(1))).toBe(
      addDays(march(1), LIMITS.horizon)
    );
  });

  it('is the earlier of the span and the horizon', () => {
    // First day today: the horizon (five years) is farther than the span (a year).
    expect(latestEditableDay(march(1), march(1))).toBe(
      addDays(march(1), LIMITS.span - 1)
    );
    // First day near the horizon: the horizon is the nearer one.
    expect(latestEditableDay('2030-06-01', '2026-01-01')).toBe(
      latestCandidateDay('2026-01-01')
    );
  });
});

describe('untilProblemKey', () => {
  const first = march(5);
  const today = march(1);

  it('says nothing for an empty, invalid or reachable date', () => {
    expect(untilProblemKey(first, '', today)).toBeNull();
    expect(untilProblemKey(first, '2027-3-9', today)).toBeNull();
    expect(untilProblemKey(first, march(9), today)).toBeNull();
    expect(
      untilProblemKey(first, latestEditableDay(first, today), today)
    ).toBeNull();
  });

  it('names the span at its first day over and the horizon beyond it', () => {
    const over = addDays(latestEditableDay(first, today), 1);
    expect(untilProblemKey(first, over, today)).toBe('error.rangeTooLong');
    const beyond = addDays(latestCandidateDay(today), 1);
    expect(untilProblemKey(first, beyond, today)).toBe('error.tooFar');
  });
});

describe('sameDays', () => {
  it('compares day lists by content, not identity', () => {
    expect(sameDays([], [])).toBe(true);
    expect(sameDays([march(5), march(6)], [march(5), march(6)])).toBe(true);
    expect(sameDays([march(5)], [])).toBe(false);
    expect(sameDays([], [march(5)])).toBe(false);
    expect(sameDays([march(5), march(6)], [march(5), march(7)])).toBe(false);
    expect(sameDays([march(5), march(6)], [march(6), march(5)])).toBe(false);
  });
});

describe('extendSelection', () => {
  const first = march(5);
  const last = march(7);
  const today = march(1);
  const base = all([5, 6, 7].map(march));
  const extend = (until: string, from = base, shownEnd?: ISODate) =>
    extendSelection(from, {
      first,
      last,
      until,
      today,
      ...(shownEnd === undefined ? {} : { shownEnd }),
    });

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

  describe('with the end the calendar shows', () => {
    // 5 to 7 are the saved days; the calendar was extended to the 12th and the
    // organiser switched off the 10th.
    const shown = march(12);
    const edited = () => {
      const from = extend(shown);
      from.delete(march(10));
      return from;
    };

    it('keeps an added day that was switched off when the date moves on', () => {
      const further = extend(march(15), edited(), shown);
      expect(sorted(further)).toEqual(
        [5, 6, 7, 8, 9, 11, 12, 13, 14, 15].map(march)
      );
      // Without the shown end the day comes back, which is the bug it fixes.
      expect(extend(march(15), edited()).has(march(10))).toBe(true);
    });

    it('keeps it off when the date moves back but stays past the last day', () => {
      const nearer = extend(march(11), edited(), shown);
      expect(sorted(nearer)).toEqual([5, 6, 7, 8, 9, 11].map(march));
      // And when the same date is applied again.
      const same = extend(shown, edited(), shown);
      expect(sorted(same)).toEqual([5, 6, 7, 8, 9, 11, 12].map(march));
    });

    it('keeps it off through a chain of dates, one after the other', () => {
      let selection = extend(march(9));
      let end = march(9);
      for (const until of [march(10), march(11), march(10), march(13)]) {
        selection = extend(until, selection, end);
        if (until === march(10)) selection.delete(march(10));
        end = until;
      }
      expect(sorted(selection)).toEqual([5, 6, 7, 8, 9, 11, 12, 13].map(march));
    });

    it('brings the days back as chosen after the date went below them', () => {
      // Documented limit: a day dropped with the calendar's end is gone.
      const shrunk = extend(march(9), edited(), shown);
      expect(sorted(shrunk)).toEqual([5, 6, 7, 8, 9].map(march));
      const grown = extend(shown, shrunk, march(9));
      expect(sorted(grown)).toEqual([5, 6, 7, 8, 9, 10, 11, 12].map(march));
    });

    it('returns to the saved days for the last day, an earlier date or none', () => {
      const original = [5, 6, 7].map(march);
      expect(sorted(extend(last, edited(), shown))).toEqual(original);
      expect(sorted(extend(march(6), edited(), shown))).toEqual(original);
      expect(sorted(extend(march(1), edited(), shown))).toEqual(original);
      expect(sorted(extend('', edited(), shown))).toEqual(original);
      expect(sorted(extend('2027-3-9', edited(), shown))).toEqual(original);
      // Starting again from the saved days adds everything, as at first.
      expect(
        sorted(extend(shown, extend(last, edited(), shown), last))
      ).toEqual([5, 6, 7, 8, 9, 10, 11, 12].map(march));
    });

    it('adds the first day after the last one', () => {
      const added = extend(march(8), base, last);
      expect(sorted(added)).toEqual([5, 6, 7, 8].map(march));
      // A calendar that shows only the saved days is where it starts.
      expect(sorted(extend(march(9), added, march(8)))).toEqual(
        [5, 6, 7, 8, 9].map(march)
      );
    });

    it('starts at today when the shown end lies before it', () => {
      const late = { first, last, today: march(10) };
      const grown = extendSelection(base, {
        ...late,
        until: march(12),
        shownEnd: march(8),
      });
      expect(sorted(grown)).toEqual([5, 6, 7, 10, 11, 12].map(march));
      // A shown end after today leads, and the day before it stays as it is.
      const after = extendSelection(all([5, 6, 7, 11].map(march)), {
        ...late,
        until: march(13),
        shownEnd: march(11),
      });
      expect(sorted(after)).toEqual([5, 6, 7, 11, 12, 13].map(march));
    });

    it('behaves as before without it, or with the last day', () => {
      const from = edited();
      for (const until of [march(6), last, march(9), shown, march(20), '']) {
        const plain = extend(until, from);
        expect(extend(until, from, undefined)).toEqual(plain);
        expect(extend(until, from, last)).toEqual(plain);
        // A shown end before the last day is the last day.
        expect(extend(until, from, march(6))).toEqual(plain);
      }
    });

    it('counts the days the calendar shows against what an event may hold', () => {
      const grown = extend('2029-01-01');
      expect(grown.size).toBe(LIMITS.days);
      const end = sorted(grown).at(-1)!;
      // Full: nothing is added past the shown end.
      expect(extend('2029-01-01', grown, end).size).toBe(LIMITS.days);
      // One switched off makes room for exactly one more.
      const edited = new Map(grown);
      edited.delete(march(10));
      const refilled = extend('2029-01-01', edited, end);
      expect(refilled.size).toBe(LIMITS.days);
      expect(refilled.has(march(10))).toBe(false);
      expect(refilled.has(addDays(end, 1))).toBe(true);
    });

    it('adds only the new days when nothing is left of the added ones', () => {
      const none = extend(march(9));
      none.delete(march(8));
      none.delete(march(9));
      expect(sorted(extend(march(11), none, march(9)))).toEqual(
        [5, 6, 7, 10, 11].map(march)
      );
      // The same with nothing selected at all.
      expect(sorted(extend(march(9), new Map(), last))).toEqual(
        [8, 9].map(march)
      );
      expect(extend(march(9), new Map(), march(9)).size).toBe(0);
    });
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

    it('drops it when the days are gone or the duration outgrows them', () => {
      const date = (days: ISODate[], durationDays: number) =>
        savingImpact(chosen, [], { days, durationDays }).date;
      expect(date([march(20)], 3)).toBe('dropped');
      expect(date([march(6), march(7), march(8)], 14)).toBe('dropped');
      // The start itself is not a candidate day any more, though the rest is.
      expect(date([march(7), march(8)], 2)).toBe('dropped');
      expect(date([march(6), march(7), march(8)], 3)).toBe('kept');
    });

    it('has nothing to shorten when the date has no end on record', () => {
      const open = { ...chosen, finalEnd: null };
      const next = { days: current.days, durationDays: 1 };
      expect(savingImpact(open, [], next).date).toBe('kept');
    });

    it('does not throw at the end of the calendar', () => {
      const atEnd = {
        days: ['9999-12-30', '9999-12-31'],
        durationDays: 2,
        finalStart: '9999-12-30',
        finalEnd: '9999-12-31',
      };
      const date = (current: typeof atEnd, durationDays: number) =>
        savingImpact(current, [], { days: current.days, durationDays }).date;
      expect(date(atEnd, 2)).toBe('kept');
      expect(date(atEnd, 1)).toBe('shortened');
      expect(date(atEnd, 3)).toBe('dropped');
      const last = {
        days: ['9999-12-31'],
        durationDays: 1,
        finalStart: '9999-12-31',
        finalEnd: '9999-12-31',
      };
      expect(date(last, 1)).toBe('kept');
      expect(date(last, 2)).toBe('dropped');
      expect(date(last, 14)).toBe('dropped');
    });
  });

  describe('against the loop it replaced', () => {
    // How the date was judged before blockFits did it, verbatim.
    const before = (
      current: {
        finalStart: ISODate | null;
        finalEnd: ISODate | null;
      },
      next: { days: readonly ISODate[]; durationDays: number }
    ): SavingImpact['date'] => {
      const wanted = new Set(next.days);
      let date: SavingImpact['date'] = 'kept';
      if (current.finalStart !== null) {
        const start = current.finalStart;
        const end = addDays(start, next.durationDays - 1);
        let fits = true;
        for (
          let day = start;
          compareISODate(day, end) <= 0;
          day = addDays(day, 1)
        )
          if (!wanted.has(day)) fits = false;
        if (!fits) date = 'dropped';
        else if (
          current.finalEnd !== null &&
          compareISODate(end, current.finalEnd) < 0
        )
          date = 'shortened';
      }
      return date;
    };

    const days = fc.uniqueArray(fc.integer({ min: 1, max: 20 }), {
      maxLength: 20,
    });

    it('judges every date of a window the same way', () => {
      fc.assert(
        fc.property(
          days,
          fc.option(fc.integer({ min: 1, max: 20 }), { nil: null }),
          fc.option(fc.integer({ min: 0, max: 13 }), { nil: null }),
          fc.integer({ min: 1, max: 14 }),
          (wanted, start, length, durationDays) => {
            const finalStart = start === null ? null : march(start);
            const finalEnd =
              finalStart === null || length === null
                ? null
                : addDays(finalStart, length);
            const current = {
              days: expandRange(march(1), march(20)),
              durationDays: 1,
              finalStart,
              finalEnd,
            };
            const next = { days: wanted.map(march), durationDays };
            expect(savingImpact(current, [], next).date).toBe(
              before(current, next)
            );
          }
        ),
        { numRuns: 500 }
      );
    });
  });
});
