import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  clearDays,
  joinMarks,
  sameMarks,
  splitMarks,
  toggleDays,
  type Mark,
} from '../src/index.js';

const SATURDAYS = ['2027-03-06', '2027-03-13', '2027-03-20'];

describe('toggleDays', () => {
  it('marks every target on the first tap and clears them on the second', () => {
    const first = toggleDays(new Map(), SATURDAYS, 'yes');
    expect(splitMarks(first.marks).yes).toEqual(SATURDAYS);
    expect(first.changed).toBe(3);
    const second = toggleDays(first.marks, SATURDAYS, 'yes');
    expect(second.marks.size).toBe(0);
    expect(second.changed).toBe(3);
  });

  it('completes a half-marked set rather than clearing it', () => {
    const result = toggleDays(joinMarks([SATURDAYS[0]!], []), SATURDAYS, 'yes');
    expect(splitMarks(result.marks).yes).toEqual(SATURDAYS);
    expect(result.changed).toBe(2);
  });

  it('turns maybes into the brush instead of counting them as marked', () => {
    const result = toggleDays(joinMarks([], SATURDAYS), SATURDAYS, 'yes');
    expect(splitMarks(result.marks)).toEqual({ yes: SATURDAYS, maybe: [] });
  });

  it('leaves days outside the targets alone', () => {
    const result = toggleDays(
      joinMarks(['2027-03-07'], []),
      SATURDAYS,
      'maybe'
    );
    expect(result.marks.get('2027-03-07')).toBe('yes');
  });

  it('does nothing without targets', () => {
    const current = joinMarks(['2027-03-07'], []);
    const result = toggleDays(current, [], 'yes');
    expect(result.changed).toBe(0);
    expect(sameMarks(result.marks, current)).toBe(true);
  });

  it('returns to the start after two taps on a set that was all off or all on', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.constantFrom<Mark>('yes', 'maybe'),
        (allOn, brush) => {
          const start = allOn
            ? new Map(SATURDAYS.map((d) => [d, brush]))
            : new Map<string, Mark>();
          const twice = toggleDays(
            toggleDays(start, SATURDAYS, brush).marks,
            SATURDAYS,
            brush
          );
          expect(sameMarks(twice.marks, start)).toBe(true);
        }
      )
    );
  });
});

describe('clearDays', () => {
  it('removes either mark from the targets and counts what changed', () => {
    const result = clearDays(
      joinMarks(['2027-03-06'], ['2027-03-13']),
      SATURDAYS
    );
    expect(result.marks.size).toBe(0);
    expect(result.changed).toBe(2);
  });

  it('changes nothing on unmarked days', () => {
    expect(clearDays(new Map(), SATURDAYS).changed).toBe(0);
  });
});
