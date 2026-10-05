import { type ISODate, type Marks } from '@owl/shared';

/** Whether two sets of marks agree on every one of the given days. */
export function sameMarksOn(
  days: readonly ISODate[],
  a: Marks,
  b: Marks
): boolean {
  return days.every((day) => a.get(day) === b.get(day));
}

/** The stack with `entry` on top, the oldest entries forgotten beyond `limit`. */
export function pushUndo<T>(stack: readonly T[], entry: T, limit: number): T[] {
  return [...stack, entry].slice(-limit);
}
