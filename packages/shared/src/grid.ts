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
   * The month whose name belongs beside this row: the month of the row's first
   * candidate day when the row is the first one shown or a month begins in it.
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

/** One screenful of the calendar. */
export interface GridPage {
  /** `'all'` for the single page, otherwise the month shown. */
  key: string;
  month: MonthKey | null;
  rows: WeekRow[];
}

/**
 * The calendar as pages that each fit the screen.
 *
 * When every row fits, there is one page and nothing to flip through — the
 * whole range at a glance is the point. When not, there is one page per month
 * that has candidate days; a week shared by two months appears on both, and
 * the client shows the days of the other month as inactive on each.
 */
export function paginate(
  rows: readonly WeekRow[],
  candidates: readonly ISODate[],
  maxRows: number
): GridPage[] {
  if (rows.length <= Math.max(1, maxRows)) {
    return [{ key: 'all', month: null, rows: [...rows] }];
  }
  const candidateSet = new Set(candidates);
  const months = [...new Set([...candidates].sort().map(monthKeyOf))];
  return months.map((month) => ({
    key: month,
    month,
    rows: rows.filter((row) =>
      row.days.some((day) => candidateSet.has(day) && monthKeyOf(day) === month)
    ),
  }));
}

/** Whether a day is part of the page's own month (always, on the single page). */
export function isOnPage(page: GridPage, date: ISODate): boolean {
  return page.month === null || monthKeyOf(date) === page.month;
}
