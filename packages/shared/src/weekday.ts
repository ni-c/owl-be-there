import { formatDay, type ISODate } from './dates.js';

/**
 * A calendar column's heading for the weekday of `day`, in the app and in the
 * preview picture. Arabic and Persian have no short names, only full ones and
 * letters, and Vietnamese calendars head columns T2 … CN. Urdu's letters are
 * Latin, so it keeps its short names. ICU's Portuguese for Portugal spells the
 * short names out ("segunda"); the Brazilian abbreviations ("seg.") stand in.
 */
export function weekdayColumnHeading(day: ISODate, locale: string): string {
  const base = locale.split('-')[0];
  return formatDay(day, base === 'pt' ? 'pt-BR' : locale, {
    weekday:
      base === 'ar' || base === 'fa' || base === 'vi' ? 'narrow' : 'short',
  });
}
