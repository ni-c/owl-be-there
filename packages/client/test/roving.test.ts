import type { KeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { arrowTarget, rovingKeyDown, shortcutKey } from '../src/lib/roving.ts';

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

  it('moves horizontal focus in the visible direction in RTL', () => {
    expect(arrowTarget('ArrowLeft', 0, 3, false, true)).toBe(1);
    expect(arrowTarget('ArrowRight', 0, 3, false, true)).toBe(2);
    expect(arrowTarget('ArrowDown', 0, 3, true, true)).toBe(1);
    // The end of the row wraps to its start in either reading direction.
    expect(arrowTarget('ArrowLeft', 2, 3, false, true)).toBe(0);
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

  it('moves in the mirrored direction when the document is RTL', () => {
    const s = setup('ArrowLeft');
    s.event.currentTarget = {
      ...s.event.currentTarget,
      ownerDocument: { documentElement: { dir: 'rtl' } },
    } as never;
    rovingKeyDown(
      s.event as unknown as KeyboardEvent<HTMLElement>,
      0,
      3,
      s.choose,
      false
    );
    expect(s.choose).toHaveBeenCalledWith(1);
    expect(s.focus[1]).toHaveBeenCalledOnce();
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

  it.each(['altKey', 'ctrlKey', 'metaKey'])(
    'leaves %s+Arrow to the browser',
    (modifier) => {
      const s = setup('ArrowRight');
      Object.assign(s.event, { [modifier]: true });
      rovingKeyDown(
        s.event as unknown as KeyboardEvent<HTMLElement>,
        0,
        3,
        s.choose
      );
      expect(s.choose).not.toHaveBeenCalled();
      expect(s.event.preventDefault).not.toHaveBeenCalled();
    }
  );

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

describe('shortcutKey', () => {
  it('takes a Latin letter from the key, whatever the physical position', () => {
    expect(shortcutKey('y', 'KeyY')).toBe('y');
    expect(shortcutKey('Y', 'KeyY')).toBe('y');
    // QWERTZ: the key printed Z sits where QWERTY has Y.
    expect(shortcutKey('z', 'KeyY')).toBe('z');
    expect(shortcutKey('y', 'KeyZ')).toBe('y');
  });

  it('falls back to the physical key on a layout without Latin letters', () => {
    expect(shortcutKey('н', 'KeyY')).toBe('y');
    expect(shortcutKey('ь', 'KeyM')).toBe('m');
    expect(shortcutKey('ي', 'KeyZ')).toBe('z');
    expect(shortcutKey('ㅛ', 'KeyY')).toBe('y');
  });

  it('leaves other keys alone, and tolerates a missing code', () => {
    expect(shortcutKey('?', 'Slash')).toBe('?');
    expect(shortcutKey('Enter', 'Enter')).toBe('enter');
    expect(shortcutKey('Dead', 'KeyY')).toBe('dead');
    expect(shortcutKey('н', '')).toBe('н');
    expect(shortcutKey('', 'KeyY')).toBe('');
  });
});
