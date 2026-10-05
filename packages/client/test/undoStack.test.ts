import type { ISODate, Mark } from '@owl/shared';
import { describe, expect, it } from 'vitest';
import { pushUndo, sameMarksOn } from '../src/lib/undoStack.ts';

const marks = (entries: [ISODate, Mark][]) => new Map(entries);

describe('sameMarksOn', () => {
  const days = ['2027-03-05', '2027-03-06', '2027-03-07'];

  it('is true for equal marks, including none at all', () => {
    expect(sameMarksOn(days, new Map(), new Map())).toBe(true);
    expect(
      sameMarksOn(
        days,
        marks([['2027-03-05', 'yes']]),
        marks([['2027-03-05', 'yes']])
      )
    ).toBe(true);
  });

  it('sees a mark that appeared, vanished or changed colour', () => {
    const one = marks([['2027-03-05', 'yes']]);
    expect(sameMarksOn(days, one, new Map())).toBe(false);
    expect(sameMarksOn(days, new Map(), one)).toBe(false);
    expect(sameMarksOn(days, one, marks([['2027-03-05', 'maybe']]))).toBe(
      false
    );
  });

  it('looks at the given days only', () => {
    expect(
      sameMarksOn(
        days,
        marks([['2027-03-05', 'yes']]),
        marks([
          ['2027-03-05', 'yes'],
          ['2027-04-01', 'yes'],
        ])
      )
    ).toBe(true);
    expect(sameMarksOn([], marks([['2027-03-05', 'yes']]), new Map())).toBe(
      true
    );
  });
});

describe('pushUndo', () => {
  it('puts the entry on top', () => {
    expect(pushUndo([], 'a', 3)).toEqual(['a']);
    expect(pushUndo(['a'], 'b', 3)).toEqual(['a', 'b']);
  });

  it('forgets the oldest beyond the limit and leaves the input alone', () => {
    const stack = ['a', 'b', 'c'];
    expect(pushUndo(stack, 'd', 3)).toEqual(['b', 'c', 'd']);
    expect(stack).toEqual(['a', 'b', 'c']);
    expect(pushUndo(['a'], 'b', 1)).toEqual(['b']);
  });
});
