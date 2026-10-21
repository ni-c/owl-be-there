import {
  addDays,
  formatDay,
  LOCALES,
  type Language,
  WEEKDAYS,
  weekdayColumnHeading,
  type Weekday,
} from '@owl/shared';
import { detectLanguage } from './languageStore.ts';

/**
 * The first day of the week where the reader lives: Monday almost everywhere,
 * Sunday in the United States, Canada, Brazil, Japan and a few more. Taken
 * from the browser's region, not the interface language — an English
 * interface in Germany still starts on Monday. Browsers without week data
 * (Firefox, for now) get Monday.
 */
export function firstWeekdayFor(tag: string): Weekday {
  try {
    const locale = new Intl.Locale(tag) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = locale.getWeekInfo?.() ?? locale.weekInfo;
    if (info && info.firstDay >= 1 && info.firstDay <= 7) {
      return (info.firstDay - 1) as Weekday;
    }
  } catch {
    // An odd tag: fall through.
  }
  return 0;
}

/** The seven weekdays in the order a calendar shows them, from `firstWeekday`. */
export function weekdayOrder(firstWeekday: Weekday): Weekday[] {
  return WEEKDAYS.map((offset) => ((firstWeekday + offset) % 7) as Weekday);
}

/** The name of a weekday in a locale: "Mon", "Monday" or "M". */
export function weekdayName(
  weekday: Weekday,
  locale: string,
  style: 'short' | 'long' | 'narrow'
): string {
  // 2024-01-01 was a Monday: a fixed week to take weekday names from.
  return formatDay(addDays('2024-01-01', weekday), locale, { weekday: style });
}

/** A calendar column's heading; the rule is shared with the preview picture. */
export function weekdayHeading(weekday: Weekday, locale: string): string {
  return weekdayColumnHeading(addDays('2024-01-01', weekday), locale);
}

/** Whether the column headings need the small size: Urdu's full names (جمعرات) in a wide script. */
export function longWeekdayHeadings(locale: string): boolean {
  return locale.split('-')[0] === 'ur';
}

/**
 * The locale the client formats dates and numbers in: the first of the
 * browser's tags that names the interface language and a region (`en-US`
 * reads "October 20", `en-AU` "20 October"), else the language's own entry in
 * `LOCALES`. A browser in another language (German, French interface) and a
 * tag without a region fall through, as does a tag the interface language
 * does not own (`pt-BR` in the `pt` interface). The calendar stays Gregorian
 * and the digits those of `LOCALES[language]` (Persian for `fa`), whatever
 * the region says: `ar-SA` would count in the Islamic calendar.
 */
export function formattingLocale(
  language: Language,
  browser: readonly string[]
): string {
  const fallback = LOCALES[language];
  const wanted = new Intl.Locale(fallback);
  const digits = (tag: string): string | undefined =>
    new Intl.NumberFormat(tag).resolvedOptions().numberingSystem;
  const calendar = (tag: string): string | undefined =>
    new Intl.DateTimeFormat(tag).resolvedOptions().calendar;
  const wantedDigits = wanted.numberingSystem ?? digits(fallback);
  const wantedCalendar = wanted.calendar ?? 'gregory';
  for (const tag of browser) {
    try {
      if (detectLanguage(null, [tag]) !== language) continue;
      const locale = new Intl.Locale(Intl.getCanonicalLocales(tag)[0]!);
      if (!locale.region) continue;
      const plain = new Intl.Locale(locale.baseName).toString();
      const options: Intl.LocaleOptions = {};
      if (calendar(plain) !== wantedCalendar) options.calendar = wantedCalendar;
      if (wantedDigits && digits(plain) !== wantedDigits)
        options.numberingSystem = wantedDigits;
      return new Intl.Locale(plain, options).toString();
    } catch {
      // An invalid tag: the next one.
    }
  }
  return fallback;
}
