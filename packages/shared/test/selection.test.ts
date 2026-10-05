import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyStroke,
  cellAt,
  cellsInRect,
  joinMarks,
  onCandidates,
  othersOnDays,
  sameMarks,
  splitMarks,
  strokeModeFor,
  tapDay,
  type GridGeometry,
  type Mark,
} from '../src/index.js';

const grid: GridGeometry = {
  left: 100,
  top: 50,
  width: 700,
  height: 400,
  rows: 4,
  cols: 7,
};

describe('cellAt', () => {
  it('finds the cell under a point', () => {
    expect(cellAt(grid, 150, 60)).toEqual({ row: 0, col: 0 });
    expect(cellAt(grid, 799, 449)).toEqual({ row: 3, col: 6 });
    expect(cellAt(grid, 450, 250)).toEqual({ row: 2, col: 3 });
  });

  it('clamps points outside the grid to its edge', () => {
    expect(cellAt(grid, -500, -500)).toEqual({ row: 0, col: 0 });
    expect(cellAt(grid, 5000, 5000)).toEqual({ row: 3, col: 6 });
    expect(cellAt(grid, 450, 9000)).toEqual({ row: 3, col: 3 });
  });

  it('survives a grid with no size yet', () => {
    expect(cellAt({ ...grid, width: 0, height: 0 }, 10, 10)).toEqual({
      row: 0,
      col: 0,
    });
  });
});

describe('cellsInRect', () => {
  it('spans the rectangle row by row', () => {
    expect(cellsInRect({ row: 0, col: 5 }, { row: 1, col: 6 })).toEqual([
      { row: 0, col: 5 },
      { row: 0, col: 6 },
      { row: 1, col: 5 },
      { row: 1, col: 6 },
    ]);
  });

  it('is one cell when both corners are the same', () => {
    expect(cellsInRect({ row: 2, col: 3 }, { row: 2, col: 3 })).toEqual([
      { row: 2, col: 3 },
    ]);
  });

  it('does not care which corner the drag started from', () => {
    const cell = fc.record({ row: fc.nat(10), col: fc.nat(6) });
    fc.assert(
      fc.property(cell, cell, (a, b) => {
        expect(cellsInRect(a, b)).toEqual(cellsInRect(b, a));
        expect(cellsInRect(a, b)).toHaveLength(
          (Math.abs(a.row - b.row) + 1) * (Math.abs(a.col - b.col) + 1)
        );
      })
    );
  });
});

const day = fc
  .integer({ min: 1, max: 28 })
  .map((d) => `2027-03-${String(d).padStart(2, '0')}`);
const mark = fc.constantFrom<Mark>('yes', 'maybe');
const marks = fc
  .uniqueArray(fc.tuple(day, mark), { selector: ([d]) => d })
  .map((entries) => new Map(entries));

describe('strokes', () => {
  it('paints when the first day lacks the brush, erases when it has it', () => {
    const current = joinMarks(['2027-03-06'], ['2027-03-07']);
    expect(strokeModeFor(current, '2027-03-06', 'yes')).toBe('erase');
    expect(strokeModeFor(current, '2027-03-07', 'yes')).toBe('set');
    expect(strokeModeFor(current, '2027-03-08', 'maybe')).toBe('set');
    expect(strokeModeFor(current, '2027-03-07', 'maybe')).toBe('erase');
  });

  it('overwrites the other mark when painting', () => {
    const next = applyStroke(
      joinMarks([], ['2027-03-06']),
      ['2027-03-06', '2027-03-07'],
      'yes',
      'set'
    );
    expect(splitMarks(next)).toEqual({
      yes: ['2027-03-06', '2027-03-07'],
      maybe: [],
    });
  });

  it('erases only the brush, leaving the other mark', () => {
    const next = applyStroke(
      joinMarks(['2027-03-06'], ['2027-03-07']),
      ['2027-03-06', '2027-03-07', '2027-03-08'],
      'yes',
      'erase'
    );
    expect(splitMarks(next)).toEqual({ yes: [], maybe: ['2027-03-07'] });
  });

  it('changes nothing for an empty stroke, and never the input', () => {
    const current = joinMarks(['2027-03-06'], []);
    const next = applyStroke(current, [], 'yes', 'set');
    expect(sameMarks(next, current)).toBe(true);
    expect(next).not.toBe(current);
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(
        marks,
        fc.array(day),
        mark,
        fc.constantFrom('set', 'erase' as const),
        (m, days, brush, mode) => {
          const once = applyStroke(m, days, brush, mode);
          expect(sameMarks(applyStroke(once, days, brush, mode), once)).toBe(
            true
          );
        }
      )
    );
  });

  it('treats a tap exactly like a stroke over one day', () => {
    fc.assert(
      fc.property(marks, day, mark, (m, d, brush) => {
        const stroke = applyStroke(m, [d], brush, strokeModeFor(m, d, brush));
        expect(sameMarks(tapDay(m, d, brush), stroke)).toBe(true);
      })
    );
  });

  it('turns a day on and off again with two taps', () => {
    fc.assert(
      fc.property(marks, day, mark, (m, d, brush) => {
        const twice = tapDay(tapDay(m, d, brush), d, brush);
        // Off again — unless it had the other mark, which the first tap replaced.
        expect(twice.has(d)).toBe(m.get(d) === brush);
      })
    );
  });
});

describe('marks on the wire', () => {
  it('split into sorted lists and join back', () => {
    fc.assert(
      fc.property(marks, (m) => {
        const { yes, maybe } = splitMarks(m);
        expect(yes).toEqual([...yes].sort());
        expect(sameMarks(joinMarks(yes, maybe), m)).toBe(true);
      })
    );
  });

  it('read a day in both lists as yes', () => {
    expect(joinMarks(['2027-03-06'], ['2027-03-06']).get('2027-03-06')).toBe(
      'yes'
    );
  });

  it('compare by content, size first', () => {
    expect(
      sameMarks(joinMarks(['2027-03-06'], []), joinMarks([], ['2027-03-06']))
    ).toBe(false);
    expect(sameMarks(joinMarks([], []), joinMarks(['2027-03-06'], []))).toBe(
      false
    );
  });
});

describe('onCandidates', () => {
  it('drops marks on days that are no longer candidates', () => {
    const marks = joinMarks(['2027-03-06'], ['2027-03-07']);
    const kept = onCandidates(marks, new Set(['2027-03-06']));
    expect(splitMarks(kept)).toEqual({ yes: ['2027-03-06'], maybe: [] });
  });

  it('hands back the same map when nothing goes', () => {
    const marks = joinMarks(['2027-03-06'], []);
    expect(onCandidates(marks, new Set(['2027-03-06', '2027-03-07']))).toBe(
      marks
    );
  });

  it('handles empty marks and no candidates at all', () => {
    expect(onCandidates(new Map(), new Set()).size).toBe(0);
    expect(onCandidates(joinMarks(['2027-03-06'], []), new Set()).size).toBe(0);
  });
});

describe('othersOnDays', () => {
  const person = (
    id: string,
    yes: string[],
    maybe: string[] = [],
    answered = true,
    unseen: string[] = []
  ) => ({ id, answered, yes, maybe, unseen });
  const days = ['2027-03-06', '2027-03-07'];

  it('counts the others who can and who might, per day', () => {
    const map = othersOnDays(
      days,
      [
        person('me', ['2027-03-06']),
        person('a', ['2027-03-06'], ['2027-03-07']),
        person('b', ['2027-03-07']),
      ],
      'me'
    );
    expect(map.get('2027-03-06')).toEqual({ yes: 1, maybe: 0, total: 2 });
    expect(map.get('2027-03-07')).toEqual({ yes: 1, maybe: 1, total: 2 });
  });

  it('leaves out those who have not answered, and oneself', () => {
    const map = othersOnDays(
      days,
      [person('me', days), person('silent', [], [], false), person('a', [])],
      'me'
    );
    expect(map.get('2027-03-06')).toEqual({ yes: 0, maybe: 0, total: 1 });
  });

  it('is empty with nobody else answered, or with no days', () => {
    expect(othersOnDays(days, [person('me', days)], 'me').size).toBe(0);
    expect(othersOnDays(days, [], 'me').size).toBe(0);
    expect(othersOnDays([], [person('a', days)], 'me').size).toBe(0);
  });

  it('counts a day in both lists as yes', () => {
    const map = othersOnDays(days, [person('a', days, days)], 'me');
    expect(map.get('2027-03-06')).toEqual({ yes: 1, maybe: 0, total: 1 });
  });

  it('leaves those who have not seen a day out of that day', () => {
    // 03-07 was added after Ben last saved: Anna said yes, Ben could not.
    const map = othersOnDays(
      days,
      [
        person('me', ['2027-03-06']),
        person('anna', days),
        person('ben', ['2027-03-06'], [], true, ['2027-03-07']),
      ],
      'me'
    );
    expect(map.get('2027-03-06')).toEqual({ yes: 2, maybe: 0, total: 2 });
    expect(map.get('2027-03-07')).toEqual({ yes: 1, maybe: 0, total: 1 });
  });

  it('has no entry for a day nobody has seen', () => {
    const map = othersOnDays(
      days,
      [
        person('anna', ['2027-03-06'], [], true, ['2027-03-07']),
        person('ben', ['2027-03-06'], [], true, ['2027-03-07']),
      ],
      'me'
    );
    expect(map.has('2027-03-07')).toBe(false);
    expect(map.get('2027-03-06')).toEqual({ yes: 2, maybe: 0, total: 2 });
  });

  it('has no entry for a day the only other person has not seen', () => {
    const map = othersOnDays(days, [person('anna', [], [], true, days)], 'me');
    expect(map.size).toBe(0);
  });

  it('ignores what oneself has not seen', () => {
    const map = othersOnDays(
      days,
      [person('me', [], [], true, days), person('anna', days)],
      'me'
    );
    expect(map.get('2027-03-07')).toEqual({ yes: 1, maybe: 0, total: 1 });
  });
});
