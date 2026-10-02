import type { ISODate } from './dates.js';
import type { Mark, Marks } from './selection.js';

/** The marks after a toggle, and how many days it changed. */
export interface ToggleResult {
  marks: Map<ISODate, Mark>;
  changed: number;
}

/**
 * One tap on a weekday header, a week label or "all".
 *
 * If every target already carries the brush, the tap takes it away from all of
 * them; otherwise it gives it to all of them. So the first tap on "Sat" marks
 * every Saturday, the second clears them again — and a half-marked column is
 * completed rather than cleared, because completing is what a tap on a
 * half-finished thing usually means.
 *
 * No targets is no change: a header over a column without candidate days does
 * nothing rather than counting as "all already marked".
 */
export function toggleDays(
  marks: Marks,
  targets: readonly ISODate[],
  brush: Mark
): ToggleResult {
  const next = new Map(marks);
  if (targets.length === 0) return { marks: next, changed: 0 };
  const allSet = targets.every((day) => marks.get(day) === brush);
  let changed = 0;
  for (const day of targets) {
    if (allSet) {
      next.delete(day);
      changed += 1;
    } else if (next.get(day) !== brush) {
      next.set(day, brush);
      changed += 1;
    }
  }
  return { marks: next, changed };
}

/** "None": every target loses its mark, whichever it was. */
export function clearDays(
  marks: Marks,
  targets: readonly ISODate[]
): ToggleResult {
  const next = new Map(marks);
  let changed = 0;
  for (const day of targets) if (next.delete(day)) changed += 1;
  return { marks: next, changed };
}
