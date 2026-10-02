import type { Weekday } from '@owl/shared';

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
