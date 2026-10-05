import {
  addDays,
  candidateBlocks,
  compareISODate,
  diffDays,
  expandRange,
  isValidISODate,
  LIMITS,
  maxISODate,
  minISODate,
  type ISODate,
  type Mark,
  type Marks,
} from '@owl/shared';
import type { TranslationKey } from '../i18n/en.ts';

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
 * The days the editor's calendar shows: the existing days, extended up to the
 * date typed in — as far as an event may span.
 */
export function visibleRange(
  first: ISODate,
  last: ISODate,
  until: string
): ISODate[] {
  const end = isValidISODate(until) ? maxISODate(until, last) : last;
  return expandRange(
    first,
    diffDays(first, end) + 1 <= LIMITS.span
      ? end
      : addDays(first, LIMITS.span - 1)
  );
}

/**
 * The selection after "add days up to" changed.
 *
 * Days past the calendar's new end are dropped, so what is saved is what is
 * shown. Days after the last one are added as chosen — but never days that
 * have passed (the server refuses them and the grid cannot switch them off),
 * never beyond what an event may span or how far ahead it may reach, and never
 * more than an event may hold. Whatever was added stays within those limits,
 * and a date at or before the last day adds nothing.
 */
export function extendSelection(
  selection: Marks,
  range: {
    first: ISODate;
    last: ISODate;
    until: string;
    today: ISODate;
  }
): Map<ISODate, Mark> {
  const { first, last, until, today } = range;
  const shown = visibleRange(first, last, until);
  const end = shown[shown.length - 1]!;
  const next = new Map<ISODate, Mark>();
  for (const [day, mark] of selection)
    if (compareISODate(day, end) <= 0) next.set(day, mark);
  if (!isValidISODate(until) || compareISODate(until, last) <= 0) return next;
  const limit = minISODate(
    addDays(first, LIMITS.span - 1),
    addDays(today, LIMITS.horizon)
  );
  const upTo = minISODate(until, limit);
  for (const day of expandRange(maxISODate(addDays(last, 1), today), upTo)) {
    if (next.size >= LIMITS.days) break;
    next.set(day, 'yes');
  }
  return next;
}

/** The days to save: those of the calendar shown that are still selected. */
export function daysToSave(shown: readonly ISODate[], selection: Marks) {
  return shown.filter((day) => selection.has(day));
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
    const end = addDays(start, next.durationDays - 1);
    let fits = true;
    for (let day = start; compareISODate(day, end) <= 0; day = addDays(day, 1))
      if (!wanted.has(day)) fits = false;
    if (!fits) date = 'dropped';
    else if (
      current.finalEnd !== null &&
      compareISODate(end, current.finalEnd) < 0
    )
      date = 'shortened';
  }
  return { marks, date };
}

/** Whether saving needs a confirmation first. */
export function isLossy(impact: SavingImpact): boolean {
  return impact.marks > 0 || impact.date !== 'kept';
}
