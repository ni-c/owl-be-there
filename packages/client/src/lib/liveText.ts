import type { ISODate, Marks } from '@owl/shared';

/** How many of the days differ between two sets of marks. */
export function changedCount(
  days: readonly ISODate[],
  a: Marks,
  b: Marks
): number {
  return days.filter((day) => a.get(day) !== b.get(day)).length;
}

/**
 * The text for a live region that is read out even when it is the same as the
 * last one: an unchanged region is not announced, so a no-break space comes
 * and goes at its end.
 */
export function freshAnnouncement(text: string, previous: string): string {
  const base = previous.replace(/\u00a0$/, '');
  return base === text && previous === base ? `${text}\u00a0` : text;
}
