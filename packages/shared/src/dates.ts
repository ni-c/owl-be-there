/**
 * Calendar arithmetic on plain civil dates.
 *
 * Everything in Owl Be There is a *civil* date — a wall-calendar day with no
 * time and no time zone. Using `Date` for that is the classic way to get
 * off-by-one bugs (a `new Date('2027-03-01')` is UTC midnight, which is the
 * last day of February west of Greenwich). So the whole application works on
 * `'YYYY-MM-DD'` strings and the integer day count below instead; a `Date`
 * appears only where the platform demands one — `Intl` formatting — and then
 * in UTC on purpose.
 *
 * The civil <-> day-number conversion is Howard Hinnant's `days_from_civil`
 * algorithm: exact for every year, no floating point, no leap-year table.
 */

/** A civil date as `'YYYY-MM-DD'`. */
export type ISODate = string;

/** A calendar month as `'YYYY-MM'`. */
export type MonthKey = string;

export interface CivilDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

/** Weekday index: Monday is 0, Sunday is 6 — ISO order, zero-based. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Number of days in `month` (1-12) of `year`. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return MONTH_LENGTHS[month - 1] ?? 30;
}

export function isValidISODate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

export function parseISODate(value: ISODate): CivilDate {
  const match = ISO_DATE.exec(value);
  if (!match) throw new RangeError(`Not an ISO date: ${value}`);
  const date = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  if (date.month < 1 || date.month > 12) {
    throw new RangeError(`Month out of range: ${value}`);
  }
  if (date.day < 1 || date.day > daysInMonth(date.year, date.month)) {
    throw new RangeError(`Day out of range: ${value}`);
  }
  return date;
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

export function formatISODate(date: CivilDate): ISODate {
  return `${String(date.year).padStart(4, '0')}-${pad2(date.month)}-${pad2(date.day)}`;
}

/** Days since 1970-01-01 (negative before). Hinnant's `days_from_civil`. */
export function daysFromCivil({ year, month, day }: CivilDate): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400; // [0, 399]
  const doy =
    Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of {@link daysFromCivil}. */
export function civilFromDays(days: number): CivilDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097; // [0, 146096]
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36524) -
      Math.floor(doe / 146096)) /
      365
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153); // [0, 11], March-based
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  return { year: y + (month <= 2 ? 1 : 0), month, day };
}

/** Days since 1970-01-01 of an ISO date. */
export function dayNumber(date: ISODate): number {
  return daysFromCivil(parseISODate(date));
}

/** The ISO date of a day number. */
export function isoFromDayNumber(days: number): ISODate {
  return formatISODate(civilFromDays(days));
}

export function addDays(date: ISODate, days: number): ISODate {
  return isoFromDayNumber(dayNumber(date) + days);
}

/** `b - a` in whole days. */
export function diffDays(a: ISODate, b: ISODate): number {
  return dayNumber(b) - dayNumber(a);
}

/** ISO date strings sort lexicographically, which is exactly calendar order. */
export function compareISODate(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minISODate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxISODate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

/**
 * The weekday of a date, Monday = 0. Day 0 of the count, 1970-01-01, was a
 * Thursday — index 3.
 */
export function weekdayOf(date: ISODate): Weekday {
  return ((((dayNumber(date) + 3) % 7) + 7) % 7) as Weekday;
}

/** The month a date falls in. */
export function monthKeyOf(date: ISODate): MonthKey {
  return date.slice(0, 7);
}

/**
 * The ISO 8601 week number: weeks start on Monday, and week 1 is the one that
 * contains the year's first Thursday. So 2027-01-01, a Friday, is in week 53
 * of 2026.
 */
export function isoWeekNumber(date: ISODate): number {
  const days = dayNumber(date);
  const thursday = days - weekdayOf(date) + 3;
  const { year } = civilFromDays(thursday);
  const firstOfYear = daysFromCivil({ year, month: 1, day: 1 });
  return Math.floor((thursday - firstOfYear) / 7) + 1;
}

/** Today in the *local* calendar — what a person in front of the screen calls today. */
export function todayLocal(now: Date = new Date()): ISODate {
  return formatISODate({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  });
}

/**
 * Today in UTC — what the server calls today. It cannot know the reader's
 * zone, so everything it decides by date leaves a day of slack either way.
 */
export function todayUTC(now: Date = new Date()): ISODate {
  return formatISODate({
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
  });
}

/** `'YYYYMMDD'`, the basic format calendar files and calendar links use. */
export function basicDate(date: ISODate): string {
  return date.replaceAll('-', '');
}

/**
 * A `Date` at midnight UTC of the given day, for `Intl` and nothing else.
 * Formatting it with `timeZone: 'UTC'` prints the same day everywhere.
 */
export function utcDateOf(date: ISODate): Date {
  const { year, month, day } = parseISODate(date);
  return new Date(Date.UTC(year, month - 1, day));
}

/** A day formatted for people, in any language, on the same day everywhere. */
export function formatDay(
  date: ISODate,
  locale: string,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: 'UTC',
  }).format(utcDateOf(date));
}
