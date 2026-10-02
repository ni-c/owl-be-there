import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  basicDate,
  civilFromDays,
  compareISODate,
  dayNumber,
  daysFromCivil,
  daysInMonth,
  diffDays,
  formatDay,
  isLeapYear,
  isoFromDayNumber,
  isoWeekNumber,
  isValidISODate,
  maxISODate,
  minISODate,
  monthKeyOf,
  parseISODate,
  todayLocal,
  todayUTC,
  utcDateOf,
  weekdayOf,
} from '../src/index.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('civil date conversion', () => {
  it('round-trips every day of a leap year', () => {
    let date = '2028-01-01';
    for (let i = 0; i < 366; i++) {
      expect(civilFromDays(daysFromCivil(parseISODate(date)))).toEqual(
        parseISODate(date)
      );
      expect(isoFromDayNumber(dayNumber(date))).toBe(date);
      date = addDays(date, 1);
    }
    expect(date).toBe('2029-01-01');
  });

  it('anchors the epoch', () => {
    expect(daysFromCivil({ year: 1970, month: 1, day: 1 })).toBe(0);
    expect(daysFromCivil({ year: 1969, month: 12, day: 31 })).toBe(-1);
  });

  it('steps across the leap day and the turn of the year, both ways', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2027-01-01', 0)).toBe('2027-01-01');
    expect(diffDays('2028-02-28', '2028-03-01')).toBe(2);
    expect(diffDays('2028-03-01', '2028-02-28')).toBe(-2);
  });
});

describe('calendar helpers', () => {
  it('knows leap years', () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2027, 13)).toBe(30);
  });

  it('validates ISO dates', () => {
    expect(isValidISODate('2027-02-29')).toBe(false);
    expect(isValidISODate('2028-02-29')).toBe(true);
    expect(isValidISODate('2027-13-01')).toBe(false);
    expect(isValidISODate('2027-00-10')).toBe(false);
    expect(isValidISODate('27-01-01')).toBe(false);
    expect(isValidISODate('')).toBe(false);
    expect(isValidISODate('2027-1-1')).toBe(false);
  });

  it('rejects malformed input loudly, naming the bad part', () => {
    expect(() => parseISODate('nope')).toThrow(/Not an ISO date/);
    expect(() => parseISODate('2027-13-01')).toThrow(/Month out of range/);
    expect(() => parseISODate('2027-04-31')).toThrow(/Day out of range/);
    expect(() => parseISODate('2027-04-00')).toThrow(/Day out of range/);
  });

  it('compares dates as the text they are', () => {
    expect(compareISODate('2026-12-31', '2027-01-01')).toBeLessThan(0);
    expect(compareISODate('2027-01-02', '2027-01-01')).toBeGreaterThan(0);
    expect(compareISODate('2027-01-01', '2027-01-01')).toBe(0);
    expect(minISODate('2027-03-01', '2027-02-28')).toBe('2027-02-28');
    expect(maxISODate('2027-03-01', '2027-02-28')).toBe('2027-03-01');
  });

  it('knows the weekday, Monday first', () => {
    expect(weekdayOf('1970-01-01')).toBe(3); // Thursday
    expect(weekdayOf('2026-10-02')).toBe(4); // Friday
    expect(weekdayOf('2026-10-04')).toBe(6); // Sunday
    expect(weekdayOf('2026-10-05')).toBe(0); // Monday
    expect(weekdayOf('1969-12-29')).toBe(0); // before the epoch
  });

  it('numbers ISO weeks, including week 53 and week 1 across the year', () => {
    expect(isoWeekNumber('2026-12-28')).toBe(53);
    expect(isoWeekNumber('2027-01-01')).toBe(53); // a Friday, still 2026's week
    expect(isoWeekNumber('2027-01-03')).toBe(53);
    expect(isoWeekNumber('2027-01-04')).toBe(1);
    expect(isoWeekNumber('2025-12-29')).toBe(1); // a Monday, already 2026's week 1
    expect(isoWeekNumber('2026-10-02')).toBe(40);
  });

  it('takes months and basic dates from the text', () => {
    expect(monthKeyOf('2027-03-08')).toBe('2027-03');
    expect(basicDate('2027-03-08')).toBe('20270308');
  });
});

describe('today', () => {
  it('reads the local calendar for people', () => {
    // 23:30 local on the 31st is still the 31st, whatever the offset is.
    expect(todayLocal(new Date(2026, 11, 31, 23, 30, 0))).toBe('2026-12-31');
    expect(todayLocal(new Date(2027, 0, 1, 0, 1, 0))).toBe('2027-01-01');
  });

  it('reads UTC for the server', () => {
    expect(todayUTC(new Date(Date.UTC(2026, 11, 31, 23, 59)))).toBe(
      '2026-12-31'
    );
    expect(todayUTC(new Date(Date.UTC(2027, 0, 1, 0, 1)))).toBe('2027-01-01');
  });

  it('defaults to the clock, a minute either side of local midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 2, 7, 23, 59));
    expect(todayLocal()).toBe('2027-03-07');
    vi.setSystemTime(new Date(2027, 2, 8, 0, 1));
    expect(todayLocal()).toBe('2027-03-08');
  });
});

describe('formatting', () => {
  it('prints the same day in every time zone', () => {
    // The point of the UTC round trip: a day string formatted with Intl must
    // not drift to the previous day west of Greenwich.
    expect(
      formatDay('2027-03-08', 'en-GB', { day: 'numeric', month: 'long' })
    ).toBe('8 March');
    expect(utcDateOf('2027-03-08').toISOString()).toBe(
      '2027-03-08T00:00:00.000Z'
    );
  });

  it('formats in German too', () => {
    expect(
      formatDay('2027-03-06', 'de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    ).toBe('Samstag, 6. März');
  });
});
