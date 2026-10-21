import {
  addDays,
  blockFits,
  candidateBlocks,
  checkCandidateDays,
  compareISODate,
  diffDays,
  expandRange,
  isValidISODate,
  LIMITS,
  maxISODate,
  minISODate,
  type CandidateProblem,
  type ISODate,
  type Mark,
  type Marks,
} from '@owl/shared';
import type { TranslationKey } from '../i18n/en.ts';

/** The text for each problem `checkCandidateDays` finds, here and on the server. */
export const CANDIDATE_PROBLEM_KEY: Record<CandidateProblem, TranslationKey> = {
  past: 'error.past',
  too_far: 'error.tooFar',
  span: 'error.rangeTooLong',
};

/** The latest day a candidate day may be: `LIMITS.horizon` days from today. */
export function latestCandidateDay(today: ISODate): ISODate {
  return addDays(today, LIMITS.horizon);
}

/** The latest day the days editor can reach: bound by the span and the horizon. */
export function latestEditableDay(first: ISODate, today: ISODate): ISODate {
  return minISODate(addDays(first, LIMITS.span - 1), latestCandidateDay(today));
}

/**
 * Why the editor's "add days up to" date cannot be reached in full, as a
 * dictionary key, or null. The calendar stops at `latestEditableDay`.
 */
export function untilProblemKey(
  first: ISODate,
  until: string,
  today: ISODate
): TranslationKey | null {
  if (!isValidISODate(until)) return null;
  if (compareISODate(until, latestCandidateDay(today)) > 0)
    return 'error.tooFar';
  if (compareISODate(until, latestEditableDay(first, today)) > 0)
    return 'error.rangeTooLong';
  return null;
}

/** A text for the reader, as a dictionary key and its placeholders. */
export interface Problem {
  key: TranslationKey;
  params: Record<string, number>;
}

/**
 * What is wrong with a sorted list of candidate days for an event whose
 * choice is `duration` days in a row, or null. The same checks the server
 * makes, so the answer comes before the request, not as a bare 400.
 */
export function daysProblem(
  days: readonly ISODate[],
  duration: number
): Problem | null {
  if (days.length === 0) return { key: 'error.noDays', params: {} };
  if (days.length > LIMITS.days)
    return { key: 'error.tooManyDays', params: { max: LIMITS.days } };
  if (candidateBlocks(days, duration).length === 0)
    return { key: 'error.noBlock', params: { count: duration } };
  return null;
}

/**
 * What is wrong with the wizard's "from … to …" range, as a dictionary key, or
 * null. A reversed range is named before the limits are looked at; the limits
 * are the server's own (`checkCandidateDays`), from `today` to the horizon.
 */
export function rangeProblemKey(
  from: string,
  to: string,
  today: ISODate
): TranslationKey | null {
  if (!isValidISODate(from) || !isValidISODate(to)) return 'error.noDays';
  if (compareISODate(to, from) < 0) return 'error.range';
  const problem = checkCandidateDays(
    [from, to],
    today,
    latestCandidateDay(today)
  );
  return problem && CANDIDATE_PROBLEM_KEY[problem];
}

/**
 * The days the editor's calendar shows: the existing days, extended up to the
 * date typed in — as far as an event may span and reach ahead, the limits
 * `extendSelection` applies too.
 */
export function visibleRange(
  first: ISODate,
  last: ISODate,
  until: string,
  today: ISODate
): ISODate[] {
  const end = isValidISODate(until) ? maxISODate(until, last) : last;
  const limit = maxISODate(last, latestEditableDay(first, today));
  return expandRange(first, minISODate(end, limit));
}

/**
 * The selection after "add days up to" changed.
 *
 * Days past the calendar's new end are dropped, so what is saved is what is
 * shown. Days after the last one are added as chosen — but never days that
 * have passed (the server refuses them and the grid cannot switch them off),
 * never beyond what an event may span or how far ahead it may reach, and never
 * more than an event may hold. Whatever was added stays within those limits,
 * and a date at or before the last day adds nothing. Days after the last one
 * that the calendar already showed (`shownEnd`) are kept as they are, so one
 * the organiser switched off stays off while the date moves on.
 */
export function extendSelection(
  selection: Marks,
  range: {
    first: ISODate;
    last: ISODate;
    until: string;
    today: ISODate;
    /** The last day the calendar shows now; defaults to the last day. */
    shownEnd?: ISODate;
  }
): Map<ISODate, Mark> {
  const { first, last, until, today, shownEnd } = range;
  const shown = visibleRange(first, last, until, today);
  const end = shown[shown.length - 1]!;
  const next = new Map<ISODate, Mark>();
  for (const [day, mark] of selection)
    if (compareISODate(day, end) <= 0) next.set(day, mark);
  if (!isValidISODate(until) || compareISODate(until, last) <= 0) return next;
  const upTo = minISODate(until, latestEditableDay(first, today));
  // A date typed before the last day drops the added days; they return as chosen.
  const shownLast = maxISODate(last, shownEnd ?? last);
  for (const day of expandRange(
    maxISODate(addDays(shownLast, 1), today),
    upTo
  )) {
    if (next.size >= LIMITS.days) break;
    next.set(day, 'yes');
  }
  return next;
}

/** The days to save: those of the calendar shown that are still selected. */
export function daysToSave(shown: readonly ISODate[], selection: Marks) {
  return shown.filter((day) => selection.has(day));
}

/** Whether two sorted day lists are the same. */
export function sameDays(a: readonly ISODate[], b: readonly ISODate[]) {
  return a.length === b.length && a.every((day, i) => day === b[i]);
}

export interface SavingImpact {
  /** Answers that go with the removed days. */
  marks: number;
  /** What happens to a chosen date: kept as it is, shorter, or dropped. */
  date: 'kept' | 'shortened' | 'dropped';
}

/**
 * What saving a new day list and duration takes away: the answers on removed
 * days, and a chosen date that gets shorter or no longer fits (the server
 * drops it and the poll stays closed). A longer date that still fits is no loss.
 */
export function savingImpact(
  current: {
    days: readonly ISODate[];
    durationDays: number;
    finalStart: ISODate | null;
    finalEnd: ISODate | null;
  },
  people: readonly { yes: readonly ISODate[]; maybe: readonly ISODate[] }[],
  next: { days: readonly ISODate[]; durationDays: number }
): SavingImpact {
  const wanted = new Set(next.days);
  const removed = new Set(current.days.filter((day) => !wanted.has(day)));
  let marks = 0;
  for (const person of people)
    marks += new Set(
      [...person.yes, ...person.maybe].filter((day) => removed.has(day))
    ).size;

  let date: SavingImpact['date'] = 'kept';
  if (current.finalStart !== null) {
    const start = current.finalStart;
    if (!blockFits(wanted, start, next.durationDays)) date = 'dropped';
    else if (
      current.finalEnd !== null &&
      diffDays(start, current.finalEnd) + 1 > next.durationDays
    )
      date = 'shortened';
  }
  return { marks, date };
}

/** Whether saving needs a confirmation first. */
export function isLossy(impact: SavingImpact): boolean {
  return impact.marks > 0 || impact.date !== 'kept';
}
