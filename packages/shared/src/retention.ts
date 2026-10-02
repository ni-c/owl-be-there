import { addDays, compareISODate, maxISODate, type ISODate } from './dates.js';
import { RETENTION_DAYS } from './limits.js';

export interface RetentionInput {
  /** The UTC day of the last change. */
  lastWriteDay: ISODate;
  lastCandidateDay: ISODate;
  /** The last day of the chosen date, if there is one. */
  finalEnd: ISODate | null;
}

/**
 * The last day an event exists.
 *
 * Ninety days after the last change — and never before the event itself is
 * over: a poll set up in spring for a tournament in autumn must not vanish in
 * summer just because everybody has answered. The day after the last relevant
 * day is the earliest it may go, so a group can still look up the result on
 * the day itself.
 */
export function expiresOn({
  lastWriteDay,
  lastCandidateDay,
  finalEnd,
}: RetentionInput): ISODate {
  const lastRelevant =
    finalEnd === null
      ? lastCandidateDay
      : maxISODate(finalEnd, lastCandidateDay);
  return maxISODate(
    addDays(lastWriteDay, RETENTION_DAYS),
    addDays(lastRelevant, 1)
  );
}

/** Whether an event whose last day is `expires` is gone by `today`. */
export function isExpired(expires: ISODate, today: ISODate): boolean {
  return compareISODate(today, expires) > 0;
}
