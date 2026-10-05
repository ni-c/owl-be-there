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
  vertical = true
): number | null {
  if (length === 0) return null;
  if (key === 'ArrowRight' || (vertical && key === 'ArrowDown'))
    return (index + 1) % length;
  if (key === 'ArrowLeft' || (vertical && key === 'ArrowUp'))
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
  const next = arrowTarget(event.key, index, length, vertical);
  if (next === null) return;
  event.preventDefault();
  choose(next);
  (
    event.currentTarget.parentElement?.children[next] as HTMLElement | undefined
  )?.focus();
}
