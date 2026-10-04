import { utcDateOf, type ISODate } from './dates.js';

/** The languages the interface speaks, by code. */
export const LANGUAGES = [
  'de',
  'en',
  'es',
  'fr',
  'it',
  'ja',
  'nl',
  'pt',
] as const;

export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

/** The locale used to format dates for a language. */
export const LOCALES: Record<Language, string> = {
  de: 'de-DE',
  en: 'en-GB',
  es: 'es-ES',
  fr: 'fr-FR',
  it: 'it-IT',
  ja: 'ja-JP',
  nl: 'nl-NL',
  pt: 'pt-PT',
};

/** Each language as it names itself, for the language picker. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  ja: '日本語',
  nl: 'Nederlands',
  pt: 'Português',
};

/** The languages in alphabetical order of their own names. */
export function languagesByName(): Language[] {
  const collator = new Intl.Collator('en');
  return [...LANGUAGES].sort((a, b) =>
    collator.compare(LANGUAGE_NAMES[a], LANGUAGE_NAMES[b])
  );
}

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
  de: {
    appName: 'Owl Be There',
    tagline: 'Findet einen Tag, an dem alle können.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Trag ein, wann du kannst. Ohne Anmeldung.'
        : `Trag ein, wann du kannst · bisher ${answers} ${answers === 1 ? 'Antwort' : 'Antworten'}`,
    previewDecided: (when: string): string => `Der Termin steht: ${when}`,
    previewImageAlt: 'Eine Eule mit einem Kalender',
    calendarNote: 'Ausgewählt mit Owl Be There',
  },
  en: {
    appName: 'Owl Be There',
    tagline: 'Find a day everyone can make.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Add the days you can make it. No sign-up needed.'
        : `Add the days you can make it · ${answers} ${answers === 1 ? 'answer' : 'answers'} so far`,
    previewDecided: (when: string): string => `The date is set: ${when}`,
    previewImageAlt: 'An owl holding a calendar',
    calendarNote: 'Chosen with Owl Be There',
  },
  es: {
    appName: 'Owl Be There',
    tagline: 'Encontrad un día que os venga bien a todos.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Marca los días que te vienen bien. Sin registro.'
        : `Marca los días que te vienen bien · ${answers} ${answers === 1 ? 'respuesta' : 'respuestas'} hasta ahora`,
    previewDecided: (when: string): string => `Ya hay fecha: ${when}`,
    previewImageAlt: 'Un búho con un calendario',
    calendarNote: 'Fecha elegida con Owl Be There',
  },
  fr: {
    appName: 'Owl Be There',
    tagline: 'Trouvez une date qui convient à tout le monde.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Indique les jours où tu es libre. Sans inscription.'
        : `Indique les jours où tu es libre · ${answers} ${answers === 1 ? 'réponse' : 'réponses'} pour le moment`,
    previewDecided: (when: string): string => `La date est fixée : ${when}`,
    previewImageAlt: 'Un hibou avec un calendrier',
    calendarNote: 'Date choisie avec Owl Be There',
  },
  it: {
    appName: 'Owl Be There',
    tagline: 'Trova un giorno che vada bene a tutti.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Segna i giorni in cui ci sei. Senza registrazione.'
        : `Segna i giorni in cui ci sei · ${answers} ${answers === 1 ? 'risposta' : 'risposte'} finora`,
    previewDecided: (when: string): string => `La data è decisa: ${when}`,
    previewImageAlt: 'Un gufo con un calendario',
    calendarNote: 'Data scelta con Owl Be There',
  },
  ja: {
    appName: 'Owl Be There',
    tagline: 'みんなが集まれる日を見つけよう。',
    previewOpen: (answers: number): string =>
      answers === 0
        ? '行ける日を選んでね。登録は不要。'
        : `行ける日を選んでね · 回答は現在${answers}人`,
    previewDecided: (when: string): string => `日程決定：${when}`,
    previewImageAlt: 'カレンダーを持つフクロウ',
    calendarNote: 'Owl Be Thereで決めた日程',
  },
  nl: {
    appName: 'Owl Be There',
    tagline: 'Vind een dag waarop iedereen kan.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Vul in wanneer je kunt. Aanmelden hoeft niet.'
        : `Vul in wanneer je kunt · tot nu toe ${answers} ${answers === 1 ? 'antwoord' : 'antwoorden'}`,
    previewDecided: (when: string): string => `De datum staat vast: ${when}`,
    previewImageAlt: 'Een uil met een kalender',
    calendarNote: 'Datum gekozen met Owl Be There',
  },
  pt: {
    appName: 'Owl Be There',
    tagline: 'Encontrem um dia em que todos possam.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Marca os dias em que podes. Sem registo.'
        : `Marca os dias em que podes · ${answers} ${answers === 1 ? 'resposta' : 'respostas'} até agora`,
    previewDecided: (when: string): string => `A data está marcada: ${when}`,
    previewImageAlt: 'Uma coruja com um calendário',
    calendarNote: 'Data escolhida com Owl Be There',
  },
} as const satisfies Record<Language, unknown>;
