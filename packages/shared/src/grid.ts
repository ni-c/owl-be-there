import {
  addDays,
  dayNumber,
  isoWeekNumber,
  monthKeyOf,
  weekdayOf,
  type ISODate,
  type MonthKey,
  type Weekday,
} from './dates.js';

/** One row of the calendar: seven consecutive days. */
export interface WeekRow {
  /** The first day of the row, a `firstWeekday`. */
  start: ISODate;
  /** The seven days of the row, in display order. */
  days: ISODate[];
  /** ISO week number of the row's Monday-based week, for the row label. */
  weekNumber: number;
  /**
   * The month whose name belongs beside this row: the first month among the
   * row's candidate days that no earlier row names, or null when every month
   * in the row is already named.
   */
  monthLabel: MonthKey | null;
  /** True when weeks without any candidate day were left out above this row. */
  gapBefore: boolean;
}

/** The first day of the row a date belongs to. */
export function rowStartOf(date: ISODate, firstWeekday: Weekday): ISODate {
  const offset = (weekdayOf(date) - firstWeekday + 7) % 7;
  return addDays(date, -offset);
}

/**
 * The rows that hold the candidate days — only those weeks, so a range from
 * the 20th to the 3rd is five rows, not two whole months.
 *
 * Weeks in the middle without a single candidate day are left out and the row
 * after them is marked, so a calendar of "the first and the last week of the
 * holidays" does not show four empty rows between the two.
 *
 * Each month is named once, beside the first row holding one of its candidate
 * days. A row can hold two months; it names the first one not named yet, and
 * the next row names the other — the border drawn where a month begins shows
 * the exact turn. A month whose only candidates share a row with an earlier
 * month and are followed by nothing but later months goes unnamed; its border
 * still marks it.
 */
export function buildWeeks(
  candidates: readonly ISODate[],
  firstWeekday: Weekday
): WeekRow[] {
  if (candidates.length === 0) return [];
  const sorted = [...new Set(candidates)].sort();
  const rows: WeekRow[] = [];
  const named = new Set<MonthKey>();
  let previousStart: ISODate | null = null;
  for (const day of sorted) {
    const start = rowStartOf(day, firstWeekday);
    if (start === previousStart) continue;
    const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
    const months = sorted
      .filter((candidate) => days.includes(candidate))
      .map((candidate) => monthKeyOf(candidate));
    const label = months.find((month) => !named.has(month)) ?? null;
    if (label !== null) named.add(label);
    rows.push({
      start,
      days,
      weekNumber: isoWeekNumber(addDays(start, (7 - firstWeekday) % 7)),
      monthLabel: label,
      gapBefore:
        previousStart !== null &&
        dayNumber(start) - dayNumber(previousStart) > 7,
    });
    previousStart = start;
  }
  return rows;
}
