import {
  addDays,
  compareISODate,
  diffDays,
  isValidISODate,
  weekdayOf,
  type ISODate,
  type Weekday,
} from './dates.js';
import { LIMITS } from './limits.js';

/**
 * Every day from `start` to `end`, inclusive, whose weekday is allowed.
 *
 * This is how an organiser's "from … to …, only Fridays to Sundays" becomes a
 * list of candidate days. An empty or null weekday set allows every weekday —
 * picking no weekdays at all is not a way to ask for nothing. A reversed range
 * yields nothing; a day that is no date throws, whichever bound it is; a range longer than the span limit is refused outright,
 * because the loop below would otherwise run for as long as someone's typo
 * reaches into the future.
 */
export function expandRange(
  start: ISODate,
  end: ISODate,
  weekdays: ReadonlySet<Weekday> | null = null
): ISODate[] {
  if (!isValidISODate(start) || !isValidISODate(end)) {
    throw new RangeError(`Not an ISO date: ${start} to ${end}`);
  }
  if (compareISODate(start, end) > 0) return [];
  const length = diffDays(start, end) + 1;
  if (length > LIMITS.span) {
    throw new RangeError(
      `A range of ${length} days is longer than ${LIMITS.span}`
    );
  }
  const allowAll = weekdays === null || weekdays.size === 0;
  const days: ISODate[] = [];
  for (let offset = 0; offset < length; offset += 1) {
    const day = addDays(start, offset);
    if (allowAll || weekdays.has(weekdayOf(day))) days.push(day);
  }
  return days;
}

export type CandidateProblem =
  | 'empty'
  | 'too_many'
  | 'invalid'
  | 'duplicate'
  | 'unsorted'
  | 'past'
  | 'too_far'
  | 'span';

/**
 * What is wrong with a list of candidate days, or null when nothing is.
 *
 * The list must be valid dates in strictly ascending order, at most
 * `LIMITS.days` of them, spanning at most `LIMITS.span` days. With `earliest`
 * given, the first day may not lie before it; editing an event passes null,
 * because days that have since passed are allowed to stay. With `latest`
 * given, the last day may not lie after it.
 */
export function checkCandidateDays(
  days: readonly string[],
  earliest: ISODate | null,
  latest: ISODate | null = null
): CandidateProblem | null {
  if (days.length === 0) return 'empty';
  if (days.length > LIMITS.days) return 'too_many';
  for (const day of days) if (!isValidISODate(day)) return 'invalid';
  for (let index = 1; index < days.length; index += 1) {
    const order = compareISODate(days[index - 1]!, days[index]!);
    if (order === 0) return 'duplicate';
    if (order > 0) return 'unsorted';
  }
  const first = days[0]!;
  const last = days[days.length - 1]!;
  if (earliest !== null && compareISODate(first, earliest) < 0) return 'past';
  if (latest !== null && compareISODate(last, latest) > 0) return 'too_far';
  if (diffDays(first, last) + 1 > LIMITS.span) return 'span';
  return null;
}

/** A copy of the days, sorted and without duplicates. */
export function normalizeDays(days: Iterable<ISODate>): ISODate[] {
  return [...new Set(days)].sort(compareISODate);
}
