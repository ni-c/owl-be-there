import type { KeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { arrowTarget, rovingKeyDown } from '../src/lib/roving.ts';

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

  it('ignores up and down in a horizontal strip', () => {
    expect(arrowTarget('ArrowDown', 0, 3, false)).toBeNull();
    expect(arrowTarget('ArrowUp', 0, 3, false)).toBeNull();
    expect(arrowTarget('ArrowRight', 2, 3, false)).toBe(0);
    expect(arrowTarget('ArrowLeft', 0, 3, false)).toBe(2);
  });
});

describe('rovingKeyDown', () => {
  function setup(key: string) {
    const focus = [vi.fn(), vi.fn(), vi.fn()];
    const event = {
      key,
      preventDefault: vi.fn(),
      currentTarget: {
        parentElement: { children: focus.map((f) => ({ focus: f })) },
      },
    };
    const choose = vi.fn();
    return { focus, event, choose };
  }
  const run = (
    key: string,
    index: number,
    vertical?: boolean
  ): ReturnType<typeof setup> => {
    const s = setup(key);
    rovingKeyDown(
      s.event as unknown as KeyboardEvent<HTMLElement>,
      index,
      3,
      s.choose,
      vertical
    );
    return s;
  };

  it('chooses the neighbour and moves the focus to it', () => {
    const s = run('ArrowRight', 0);
    expect(s.choose).toHaveBeenCalledExactlyOnceWith(1);
    expect(s.event.preventDefault).toHaveBeenCalledOnce();
    expect(s.focus[1]).toHaveBeenCalledOnce();
    expect(s.focus[0]).not.toHaveBeenCalled();
  });

  it('wraps in both directions', () => {
    expect(run('ArrowRight', 2).focus[0]).toHaveBeenCalledOnce();
    const left = run('ArrowLeft', 0);
    expect(left.choose).toHaveBeenCalledWith(2);
    expect(left.focus[2]).toHaveBeenCalledOnce();
  });

  it('leaves every other key alone', () => {
    const s = run('Tab', 1);
    expect(s.choose).not.toHaveBeenCalled();
    expect(s.event.preventDefault).not.toHaveBeenCalled();
    expect(s.focus.every((f) => !f.mock.calls.length)).toBe(true);
  });

  it('lets a horizontal strip keep up and down for the page', () => {
    const s = run('ArrowDown', 0, false);
    expect(s.choose).not.toHaveBeenCalled();
    expect(s.event.preventDefault).not.toHaveBeenCalled();
  });

  it('chooses even when the group has no parent to focus in', () => {
    const s = setup('ArrowRight');
    s.event.currentTarget = { parentElement: null } as never;
    rovingKeyDown(
      s.event as unknown as KeyboardEvent<HTMLElement>,
      0,
      3,
      s.choose
    );
    expect(s.choose).toHaveBeenCalledWith(1);
  });
});
