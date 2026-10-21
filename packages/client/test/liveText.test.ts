import type { Marks } from '@owl/shared';
import { describe, expect, it } from 'vitest';
import { changedCount, freshAnnouncement } from '../src/lib/liveText.ts';

const marks = (entries: [string, 'yes' | 'maybe'][]): Marks => new Map(entries);

describe('changedCount', () => {
  const days = ['2027-03-01', '2027-03-02', '2027-03-03'];

  it('counts days that differ in either direction', () => {
    const a = marks([['2027-03-01', 'yes']]);
    const b = marks([
      ['2027-03-01', 'maybe'],
      ['2027-03-02', 'yes'],
    ]);
    expect(changedCount(days, a, b)).toBe(2);
    expect(changedCount(days, b, a)).toBe(2);
  });

  it('is zero for equal marks and for empty marks', () => {
    expect(changedCount(days, marks([]), marks([]))).toBe(0);
    const a = marks([['2027-03-02', 'yes']]);
    expect(changedCount(days, a, new Map(a))).toBe(0);
  });

  it('ignores days that are not in the list', () => {
    expect(changedCount(days, marks([['2030-01-01', 'yes']]), marks([]))).toBe(
      0
    );
    expect(changedCount([], marks([['2027-03-01', 'yes']]), marks([]))).toBe(0);
  });
});

describe('freshAnnouncement', () => {
  it('changes an announcement that would repeat the last one', () => {
    const first = freshAnnouncement('3 days changed', '');
    expect(first).toBe('3 days changed');
    const second = freshAnnouncement('3 days changed', first);
    expect(second).not.toBe(first);
    expect(second.trim()).toBe('3 days changed');
    expect(freshAnnouncement('3 days changed', second)).toBe(first);
  });

  it('leaves a different text alone', () => {
    expect(freshAnnouncement('1 day changed', '3 days changed')).toBe(
      '1 day changed'
    );
    expect(freshAnnouncement('1 day changed', '3 days changed ')).toBe(
      '1 day changed'
    );
  });
});
