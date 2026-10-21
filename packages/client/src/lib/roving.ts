import type { KeyboardEvent } from 'react';

/**
 * The option an arrow key moves to in a row of radios or tabs, wrapping at
 * both ends; null for any other key. Up and down follow left and right, as in
 * a native radio group, unless `vertical` is off (a horizontal tab strip).
 */
export function arrowTarget(
  key: string,
  index: number,
  length: number,
  vertical = true,
  rtl = false
): number | null {
  if (length === 0) return null;
  if (
    (rtl ? key === 'ArrowLeft' : key === 'ArrowRight') ||
    (vertical && key === 'ArrowDown')
  )
    return (index + 1) % length;
  if (
    (rtl ? key === 'ArrowRight' : key === 'ArrowLeft') ||
    (vertical && key === 'ArrowUp')
  )
    return (index - 1 + length) % length;
  return null;
}

/**
 * The key handler of one button in a roving group (radios, tabs): an arrow
 * key chooses the neighbour and moves the focus to it, as in a native radio
 * group. The group's buttons must be the only children of their parent.
 */
export function rovingKeyDown(
  event: KeyboardEvent<HTMLElement>,
  index: number,
  length: number,
  choose: (index: number) => void,
  vertical = true
): void {
  // Alt/Cmd+Arrow is the browser's Back and Forward, Ctrl+Arrow the screen
  // reader's or the window manager's.
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const next = arrowTarget(
    event.key,
    index,
    length,
    vertical,
    event.currentTarget.ownerDocument?.documentElement.dir === 'rtl'
  );
  if (next === null) return;
  event.preventDefault();
  choose(next);
  (
    event.currentTarget.parentElement?.children[next] as HTMLElement | undefined
  )?.focus();
}

/**
 * The letter a shortcut key stands for, lower case. A Latin letter is taken
 * from `key`, so a QWERTZ or AZERTY layout keeps the letter printed on its
 * keys; on a layout without Latin letters (Cyrillic, Arabic, Persian, Korean,
 * Japanese, Chinese) the physical key (`code`: KeyY, KeyM, KeyZ) stands in.
 * Any other key comes back lower-cased as it is.
 */
export function shortcutKey(key: string, code: string): string {
  if (/^[a-z]$/i.test(key)) return key.toLowerCase();
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter && key.length > 0 && key.codePointAt(0)! > 0x7f)
    return letter[1]!.toLowerCase();
  return key.toLowerCase();
}
