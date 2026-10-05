import { addDays, type ISODate } from '@owl/shared';

/**
 * The day an event is deleted. `expiresOn` is the last day it still exists;
 * the sweep removes it on the day after.
 */
export function deletionDay(expiresOn: ISODate): ISODate {
  return addDays(expiresOn, 1);
}

/** Which privacy sentence to show for an operator-set number of days. */
export type RetentionNote = { kind: 'none' } | { kind: 'days'; days: number };

/**
 * `null` when the operator did not state a period; "none" for 0 days, which
 * would otherwise read "deleted after 0 days"; the counted text for the rest.
 */
export function retentionNote(
  days: number | null | undefined
): RetentionNote | null {
  if (days === null || days === undefined) return null;
  return days === 0 ? { kind: 'none' } : { kind: 'days', days };
}
