import {
  addDays,
  compareISODate,
  diffDays,
  maxISODate,
  type ISODate,
} from './dates.js';
import { RETENTION_DAYS } from './limits.js';

/** The last day an ISO date can name. */
const LAST_DAY: ISODate = '9999-12-31';

export interface RetentionInput {
  /** The UTC day of the last change. */
  lastWriteDay: ISODate;
  lastCandidateDay: ISODate;
  /** The last day of the chosen date, if there is one. */
  finalEnd: ISODate | null;
  /** Whether anybody has marked days; names on the roster alone do not count. */
  answered: boolean;
}

/**
 * The last day an event exists.
 *
 * Ninety days after the last change — and, once somebody has answered, never
 * before the event itself is over: a poll set up in spring for a tournament in
 * autumn must not vanish in summer just because everybody has answered. The
 * day after the last relevant day is the earliest it may go, so a group can
 * still look up the result on the day itself.
 *
 * An event nobody has answered gets no such extension. Anyone can create one
 * with days years ahead, and it would otherwise take up room for years.
 */
export function expiresOn({
  lastWriteDay,
  lastCandidateDay,
  finalEnd,
  answered,
}: RetentionInput): ISODate {
  if (!answered) return later(lastWriteDay, RETENTION_DAYS);
  const lastRelevant =
    finalEnd === null
      ? lastCandidateDay
      : maxISODate(finalEnd, lastCandidateDay);
  return maxISODate(
    later(lastWriteDay, RETENTION_DAYS),
    later(lastRelevant, 1)
  );
}

/**
 * `days` after `day`, but never past 9999-12-31, the last day there is: beyond
 * it `addDays` throws, and a five-digit year would sort before every
 * four-digit one and lose every comparison.
 */
function later(day: ISODate, days: number): ISODate {
  return diffDays(day, LAST_DAY) < days ? LAST_DAY : addDays(day, days);
}

/** Whether an event whose last day is `expires` is gone by `today`. */
export function isExpired(expires: ISODate, today: ISODate): boolean {
  return compareISODate(today, expires) > 0;
}
