import { utcDateOf, type ISODate } from './dates.js';

/** The languages the interface speaks. The first is the fallback. */
export const LANGUAGES = ['en', 'de'] as const;

export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

/** The locale used to format dates for a language. */
export const LOCALES: Record<Language, string> = { en: 'en-GB', de: 'de-DE' };

/**
 * A day or a block of days for people: "Sat 8 March 2027", or
 * "Sat 7 – Sun 8 March 2027" — `formatRange` leaves out what both ends share.
 */
export function formatDayRange(
  start: ISODate,
  end: ISODate,
  locale: string
): string {
  const format = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return start === end
    ? format.format(utcDateOf(start))
    : format.formatRange(utcDateOf(start), utcDateOf(end));
}

/**
 * The texts the server writes itself: link previews and calendar files.
 *
 * Fixed sentences on purpose. A preview is what a stranger sees before
 * clicking, so it carries the title and nothing else the organiser wrote —
 * a description would make every event a free advert on a trusted domain.
 */
export const SERVER_TEXTS = {
  en: {
    appName: 'Owl Be There',
    tagline: 'Find the day that works for everyone.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Mark the days you can make it — no sign-up needed.'
        : `Mark the days you can make it · ${answers} ${answers === 1 ? 'answer' : 'answers'} so far`,
    previewDecided: (when: string): string => `It's decided: ${when}`,
    previewImageAlt: 'An owl holding a calendar',
    calendarNote: 'Chosen with Owl Be There',
  },
  de: {
    appName: 'Owl Be There',
    tagline: 'Finde den Tag, der allen passt.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Markiere die Tage, an denen du kannst – ohne Anmeldung.'
        : `Markiere die Tage, an denen du kannst · bisher ${answers} ${answers === 1 ? 'Antwort' : 'Antworten'}`,
    previewDecided: (when: string): string => `Es ist entschieden: ${when}`,
    previewImageAlt: 'Eine Eule mit einem Kalender',
    calendarNote: 'Ausgewählt mit Owl Be There',
  },
} as const satisfies Record<Language, unknown>;
