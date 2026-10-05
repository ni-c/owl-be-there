import type { RankedBlock } from '@owl/shared';
import { describe, expect, it } from 'vitest';
import {
  liveHidden,
  liveOpenDay,
  liveSelection,
} from '../src/lib/groupState.ts';

const block = (start: string, yes: string[] = []): RankedBlock => ({
  start,
  end: start,
  days: [start],
  tally: { yes, maybe: [], no: [], open: [] },
  meetsMin: true,
  mayMeetMin: true,
});

describe('liveHidden', () => {
  const known = new Map([
    ['a', 1],
    ['b', 2],
  ]);
  it('drops people who are gone', () => {
    expect([...liveHidden(new Set(['a', 'x']), known)]).toEqual(['a']);
  });
  it('keeps the same set when everyone is still there', () => {
    const hidden = new Set(['a', 'b']);
    expect(liveHidden(hidden, known)).toBe(hidden);
  });
  it('handles none hidden and nobody known', () => {
    expect(liveHidden(new Set(), known).size).toBe(0);
    expect(liveHidden(new Set(['a']), new Map()).size).toBe(0);
  });
});

describe('liveSelection', () => {
  it('follows the block with the same start', () => {
    const fresh = block('2027-03-02', ['a']);
    expect(liveSelection(block('2027-03-02'), [fresh])).toBe(fresh);
  });
  it('is none when the block left the ranking, or nothing was selected', () => {
    expect(
      liveSelection(block('2027-03-02'), [block('2027-03-03')])
    ).toBeNull();
    expect(liveSelection(block('2027-03-02'), [])).toBeNull();
    expect(liveSelection(null, [block('2027-03-02')])).toBeNull();
  });
});

describe('liveOpenDay', () => {
  const days = ['2027-03-01', '2027-03-02'];
  it('keeps a day that is still a candidate', () => {
    expect(liveOpenDay('2027-03-02', days, true)).toBe('2027-03-02');
  });
  it('closes the sheet of a removed day', () => {
    expect(liveOpenDay('2027-03-09', days, true)).toBeNull();
    expect(liveOpenDay('2027-03-01', [], true)).toBeNull();
  });
  it('closes it while nobody has answered, and with nothing open', () => {
    expect(liveOpenDay('2027-03-01', days, false)).toBeNull();
    expect(liveOpenDay(null, days, true)).toBeNull();
  });
});
