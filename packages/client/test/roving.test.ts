import { describe, expect, it } from 'vitest';
import { arrowTarget } from '../src/lib/roving.ts';

describe('arrowTarget', () => {
  it('moves forward with right and down, backward with left and up', () => {
    expect(arrowTarget('ArrowRight', 0, 3)).toBe(1);
    expect(arrowTarget('ArrowDown', 1, 3)).toBe(2);
    expect(arrowTarget('ArrowLeft', 2, 3)).toBe(1);
    expect(arrowTarget('ArrowUp', 1, 3)).toBe(0);
  });

  it('wraps from the last option to the first and back', () => {
    expect(arrowTarget('ArrowRight', 2, 3)).toBe(0);
    expect(arrowTarget('ArrowDown', 2, 3)).toBe(0);
    expect(arrowTarget('ArrowLeft', 0, 3)).toBe(2);
    expect(arrowTarget('ArrowUp', 0, 3)).toBe(2);
  });

  it('stays on a single option and on an empty row', () => {
    expect(arrowTarget('ArrowRight', 0, 1)).toBe(0);
    expect(arrowTarget('ArrowLeft', 0, 1)).toBe(0);
    expect(arrowTarget('ArrowRight', 0, 0)).toBeNull();
  });

  it('ignores every other key', () => {
    for (const key of ['Enter', ' ', 'Tab', 'Home', 'a'])
      expect(arrowTarget(key, 1, 3)).toBeNull();
  });
});
