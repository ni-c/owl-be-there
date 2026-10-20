import { dayFormatter, utcDateOf, type ISODate } from './dates.js';
import type { EventSnapshotData } from './schemas.js';

/** The languages the interface speaks, by code. */
export const LANGUAGES = [
  'ar',
  'cs',
  'de',
  'en',
  'es',
  'es-419',
  'fa',
  'fi',
  'fr',
  'id',
  'it',
  'ja',
  'ko',
  'nb',
  'nl',
  'pl',
  'pt',
  'pt-BR',
  'ru',
  'sv',
  'tr',
  'uk',
  'ur',
  'vi',
  'zh-Hans',
  'zh-Hant',
] as const;

export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

/** The languages written right to left. */
export const RTL_LANGUAGES: readonly Language[] = ['ar', 'fa', 'ur'];

export function isRtl(language: Language): boolean {
  return RTL_LANGUAGES.includes(language);
}

/** The locale used to format dates for a language. */
export const LOCALES: Record<Language, string> = {
  ar: 'ar',
  cs: 'cs-CZ',
  de: 'de-DE',
  en: 'en-GB',
  es: 'es-ES',
  'es-419': 'es-419',
  // Persian digits, but the Gregorian calendar the candidate days are in.
  fa: 'fa-IR-u-ca-gregory',
  fi: 'fi-FI',
  fr: 'fr-FR',
  id: 'id-ID',
  it: 'it-IT',
  ja: 'ja-JP',
  ko: 'ko-KR',
  nb: 'nb-NO',
  nl: 'nl-NL',
  pl: 'pl-PL',
  pt: 'pt-PT',
  'pt-BR': 'pt-BR',
  ru: 'ru-RU',
  sv: 'sv-SE',
  tr: 'tr-TR',
  uk: 'uk-UA',
  ur: 'ur-PK',
  vi: 'vi-VN',
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
};

/** Each language as it names itself, for the language picker. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  ar: 'العربية',
  cs: 'Čeština',
  de: 'Deutsch',
  en: 'English',
  es: 'Español (España)',
  'es-419': 'Español (Latinoamérica)',
  fa: 'فارسی',
  fi: 'Suomi',
  fr: 'Français',
  id: 'Bahasa Indonesia',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  nb: 'Norsk (bokmål)',
  nl: 'Nederlands',
  pl: 'Polski',
  pt: 'Português (Portugal)',
  'pt-BR': 'Português (Brasil)',
  ru: 'Русский',
  sv: 'Svenska',
  tr: 'Türkçe',
  uk: 'Українська',
  ur: 'اردو',
  vi: 'Tiếng Việt',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
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
  const format = dayFormatter(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return start === end
    ? format.format(utcDateOf(start))
    : format.formatRange(utcDateOf(start), utcDateOf(end));
}

/** The app's name. It is not translated, and every surface spells it alike. */
export const APP_NAME = 'Owl Be There';

/**
 * The line under the name, one per language. The client's dictionaries and the
 * server's texts both read it from here, so the browser tab and the link
 * preview cannot drift apart.
 */
export const TAGLINES: Record<Language, string> = {
  ar: 'اعثر على يوم يناسب الجميع.',
  cs: 'Najděte den, který vyhovuje všem.',
  de: 'Findet einen Tag, an dem alle können.',
  en: 'Find a day everyone can make.',
  es: 'Encontrad un día que os venga bien a todos.',
  'es-419': 'Encuentren un día que les quede bien a todos.',
  fa: 'روزی پیدا کنید که همه بتوانند بیایند.',
  fi: 'Löydä päivä, joka sopii kaikille.',
  fr: 'Trouvez une date qui convient à tout le monde.',
  id: 'Temukan hari yang cocok untuk semua.',
  it: 'Trova un giorno che vada bene a tutti.',
  ja: 'みんなが集まれる日を見つけよう。',
  ko: '모두 모일 수 있는 날을 찾아보세요.',
  nb: 'Finn en dag som passer for alle.',
  nl: 'Vind een dag waarop iedereen kan.',
  pl: 'Znajdź dzień, który pasuje wszystkim.',
  pt: 'Encontrem um dia em que todos possam.',
  'pt-BR': 'Encontrem um dia em que todo mundo possa.',
  ru: 'Найдите день, который подходит всем.',
  sv: 'Hitta en dag som passar alla.',
  tr: 'Herkese uyan bir gün bulun.',
  uk: 'Знайдіть день, який підходить усім.',
  ur: 'ایسا دن تلاش کریں جب سب آ سکیں۔',
  vi: 'Cùng tìm một ngày mọi người đều rảnh.',
  'zh-Hans': '找到大家都有空的日子。',
  'zh-Hant': '找出大家都方便的日子。',
};

/**
 * The English start page description, for search results and link previews.
 * The client's English lead is the same sentence; the other languages word the
 * lead for people and the description for search engines, so they differ.
 */
export const DESCRIPTION_EN =
  'When can everyone make it? Mark your days on the calendar and find out. No sign-up or tracking.';

const russianPlural = new Intl.PluralRules('ru-RU');
/** Persian digits, as Persian dates have them. */
const persianNumber = new Intl.NumberFormat('fa-IR', { useGrouping: false });
const arabicPlural = new Intl.PluralRules('ar');

function arabicAnswerCount(count: number): string {
  const category = arabicPlural.select(count);
  if (category === 'one') return `إجابة واحدة (${count}) حتى الآن`;
  if (category === 'two') return `إجابتان (${count}) حتى الآن`;
  if (category === 'few') return `${count} إجابات حتى الآن`;
  return `${count} إجابة حتى الآن`;
}

function arabicDayCount(count: number): string {
  const category = arabicPlural.select(count);
  if (category === 'one') return `يوم آخر (${count})`;
  if (category === 'two') return `يومان آخران (${count})`;
  if (category === 'few') return `${count} أيام أخرى`;
  if (category === 'many') return `${count} يوماً آخر`;
  return `${count} يوم آخر`;
}

/** Russian and Ukrainian share these plural categories for whole numbers. */
function russianForm(
  count: number,
  one: string,
  few: string,
  many: string
): string {
  const category = russianPlural.select(count);
  return category === 'one' ? one : category === 'few' ? few : many;
}

/**
 * The texts the server writes itself: link previews and calendar files.
 *
 * Fixed sentences on purpose. A preview is what a stranger sees before
 * clicking, so it carries the title and nothing else the organiser wrote —
 * a description would make every event a free advert on a trusted domain.
 */
export const SERVER_TEXTS = {
  ar: {
    appName: APP_NAME,
    tagline: TAGLINES.ar,
    description:
      'متى يستطيع الجميع الحضور؟ حدّد الأيام المناسبة لك في التقويم واعثر على الموعد الأنسب. بلا تسجيل أو تتبّع.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'حدّد الأيام التي تناسبك. لا حاجة إلى التسجيل.'
        : `حدّد الأيام التي تناسبك · ${arabicAnswerCount(answers)}`,
    previewDecided: (when: string): string => `تحدّد الموعد: ${when}`,
    previewClosed: 'أُغلق التصويت على الموعد.',
    previewImageAlt: 'بومة مع تقويم',
    previewCalendarAlt: 'الأيام المقترحة في تقويم ملوّن بحسب عدد المتاحين',
    // No plus sign: Noto Sans Arabic has none, and the words already say "more".
    previewMoreDays: (days: number): string => arabicDayCount(days),
    calendarNote: 'اختير الموعد باستخدام Owl Be There',
  },
  cs: {
    appName: APP_NAME,
    tagline: TAGLINES.cs,
    description:
      'Kdy mohou všichni? Označ v kalendáři dny, kdy máš čas, a najdi vhodný termín. Bez registrace a sledování.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Označ dny, kdy máš čas. Bez registrace.'
        : `Označ dny, kdy máš čas · zatím ${answers} ${answers === 1 ? 'odpověď' : answers >= 2 && answers <= 4 ? 'odpovědi' : 'odpovědí'}`,
    previewDecided: (when: string): string => `Termín je stanoven: ${when}`,
    previewClosed: 'Hlasování o termínu je uzavřeno.',
    previewImageAlt: 'Sova s kalendářem',
    previewCalendarAlt:
      'Možné termíny v kalendáři, barevně odlišené podle počtu dostupných lidí',
    previewMoreDays: (days: number): string =>
      `+ ${days} ${days === 1 ? 'další den' : days >= 2 && days <= 4 ? 'další dny' : 'dalších dní'}`,
    calendarNote: 'Termín vybrán pomocí Owl Be There',
  },
  de: {
    appName: APP_NAME,
    tagline: TAGLINES.de,
    /** The start page's description for search results and link previews. */
    description:
      'Wann können alle? Trag deine Tage im Kalender ein und finde es heraus. Ohne Anmeldung und ohne Tracking.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Trag ein, wann du kannst. Ohne Anmeldung.'
        : `Trag ein, wann du kannst · bisher ${answers} ${answers === 1 ? 'Antwort' : 'Antworten'}`,
    previewDecided: (when: string): string => `Der Termin steht: ${when}`,
    previewClosed: 'Die Abstimmung ist geschlossen.',
    previewImageAlt: 'Eine Eule mit einem Kalender',
    previewCalendarAlt:
      'Die möglichen Tage im Kalender, gefärbt danach, wie viele können',
    /** Below the preview's calendar when a long poll is cut. */
    previewMoreDays: (days: number): string =>
      days === 1 ? '+ 1 weiterer Tag' : `+ ${days} weitere Tage`,
    calendarNote: 'Ausgewählt mit Owl Be There',
  },
  en: {
    appName: APP_NAME,
    tagline: TAGLINES.en,
    description: DESCRIPTION_EN,
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Add the days you can make it. No sign-up needed.'
        : `Add the days you can make it · ${answers} ${answers === 1 ? 'answer' : 'answers'} so far`,
    previewDecided: (when: string): string => `The date is set: ${when}`,
    previewClosed: 'This poll is closed.',
    previewImageAlt: 'An owl holding a calendar',
    previewCalendarAlt:
      'The days to choose from on a calendar, coloured by how many can make it',
    previewMoreDays: (days: number): string =>
      `+ ${days} more ${days === 1 ? 'day' : 'days'}`,
    calendarNote: 'Chosen with Owl Be There',
  },
  es: {
    appName: APP_NAME,
    tagline: TAGLINES.es,
    description:
      '¿Cuándo pueden todos? Marca tus días en el calendario y descúbrelo. Sin registro ni rastreo.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Marca los días que te vienen bien. Sin registro.'
        : `Marca los días que te vienen bien · ${answers} ${answers === 1 ? 'respuesta' : 'respuestas'} hasta ahora`,
    previewDecided: (when: string): string => `Ya hay fecha: ${when}`,
    previewClosed: 'Esta votación está cerrada.',
    previewImageAlt: 'Un búho con un calendario',
    previewCalendarAlt:
      'Los días posibles en un calendario, coloreados según cuántos pueden',
    previewMoreDays: (days: number): string =>
      `+ ${days} ${days === 1 ? 'día más' : 'días más'}`,
    calendarNote: 'Fecha elegida con Owl Be There',
  },
  'es-419': {
    appName: APP_NAME,
    tagline: TAGLINES['es-419'],
    description:
      '¿Cuándo pueden todos? Marca tus días en el calendario y descúbrelo. Sin registro ni rastreo.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Marca los días que puedes. Sin registro.'
        : `Marca los días que puedes · ${answers} ${answers === 1 ? 'respuesta' : 'respuestas'} hasta ahora`,
    previewDecided: (when: string): string => `Ya hay fecha: ${when}`,
    previewClosed: 'Esta encuesta está cerrada.',
    previewImageAlt: 'Un búho con un calendario',
    previewCalendarAlt:
      'Los días posibles en un calendario, con colores según cuántos pueden',
    previewMoreDays: (days: number): string =>
      `+ ${days} ${days === 1 ? 'día más' : 'días más'}`,
    calendarNote: 'Fecha elegida con Owl Be There',
  },
  fa: {
    appName: APP_NAME,
    tagline: TAGLINES.fa,
    description:
      'همه کی می‌توانند؟ روزهایت را در تقویم علامت بزن و پیدایش کن. بدون ثبت‌نام و بدون ردیابی.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'روزهایی را که می‌توانی علامت بزن. بدون ثبت‌نام.'
        : `روزهایی را که می‌توانی علامت بزن، تا حالا ${persianNumber.format(answers)} پاسخ`,
    previewDecided: (when: string): string => `تاریخ نهایی شد: ${when}`,
    previewClosed: 'نظرسنجی بسته شده است.',
    previewImageAlt: 'جغدی با یک تقویم',
    previewCalendarAlt:
      'روزهای پیشنهادی در تقویم، رنگ‌شده بر اساس تعداد کسانی که می‌توانند',
    // No plus sign: Noto Sans Arabic has none, and the words already say "more".
    previewMoreDays: (days: number): string =>
      `${persianNumber.format(days)} روز دیگر`,
    calendarNote: 'تاریخ با Owl Be There انتخاب شد',
  },
  fi: {
    appName: APP_NAME,
    tagline: TAGLINES.fi,
    description:
      'Milloin kaikille sopii? Merkitse sopivat päivät kalenteriin ja ota selvää. Ei rekisteröitymistä eikä seurantaa.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Merkitse päivät, jolloin pääset mukaan. Rekisteröitymistä ei tarvita.'
        : `Merkitse päivät, jolloin pääset mukaan · tähän mennessä ${answers} ${answers === 1 ? 'vastaus' : 'vastausta'}`,
    previewDecided: (when: string): string => `Ajankohta on päätetty: ${when}`,
    previewClosed: 'Äänestys on suljettu.',
    previewImageAlt: 'Pöllö ja kalenteri',
    previewCalendarAlt:
      'Mahdolliset päivät kalenterissa väritettyinä osallistujamäärän mukaan',
    previewMoreDays: (days: number): string =>
      `+ ${days} ${days === 1 ? 'päivä' : 'päivää'} lisää`,
    calendarNote: 'Ajankohta valittu Owl Be There -palvelulla',
  },
  fr: {
    appName: APP_NAME,
    tagline: TAGLINES.fr,
    description:
      'Quand tout le monde est-il libre ? Indique tes jours sur le calendrier et découvre-le. Sans inscription ni pistage.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Indique les jours où tu es libre. Sans inscription.'
        : `Indique les jours où tu es libre · ${answers} ${answers === 1 ? 'réponse' : 'réponses'} pour le moment`,
    previewDecided: (when: string): string => `La date est fixée : ${when}`,
    previewClosed: 'Ce sondage est clos.',
    previewImageAlt: 'Un hibou avec un calendrier',
    previewCalendarAlt:
      'Les jours possibles sur un calendrier, colorés selon le nombre de personnes libres',
    previewMoreDays: (days: number): string =>
      `+ ${days} ${days === 1 ? 'autre jour' : 'autres jours'}`,
    calendarNote: 'Date choisie avec Owl Be There',
  },
  id: {
    appName: APP_NAME,
    tagline: TAGLINES.id,
    description:
      'Kapan semua orang bisa hadir? Tandai harimu di kalender dan temukan jawabannya. Tanpa pendaftaran atau pelacakan.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Tandai hari saat kamu bisa hadir. Tidak perlu mendaftar.'
        : `Tandai hari saat kamu bisa hadir · ${answers} jawaban sejauh ini`,
    previewDecided: (when: string): string =>
      `Tanggal sudah ditetapkan: ${when}`,
    previewClosed: 'Voting sudah ditutup.',
    previewImageAlt: 'Burung hantu memegang kalender',
    previewCalendarAlt:
      'Hari-hari usulan di kalender, diwarnai menurut jumlah orang yang bisa hadir',
    previewMoreDays: (days: number): string => `+ ${days} hari lagi`,
    calendarNote: 'Tanggal dipilih dengan Owl Be There',
  },
  it: {
    appName: APP_NAME,
    tagline: TAGLINES.it,
    description:
      'Quando ci sono tutti? Segna i tuoi giorni sul calendario e scoprilo. Senza registrazione né tracciamento.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Segna i giorni in cui ci sei. Senza registrazione.'
        : `Segna i giorni in cui ci sei · ${answers} ${answers === 1 ? 'risposta' : 'risposte'} finora`,
    previewDecided: (when: string): string => `La data è decisa: ${when}`,
    previewClosed: 'Questo sondaggio è chiuso.',
    previewImageAlt: 'Un gufo con un calendario',
    previewCalendarAlt:
      'I giorni possibili su un calendario, colorati in base a quanti ci sono',
    previewMoreDays: (days: number): string =>
      `+ ${days} ${days === 1 ? 'altro giorno' : 'altri giorni'}`,
    calendarNote: 'Data scelta con Owl Be There',
  },
  ja: {
    appName: APP_NAME,
    tagline: TAGLINES.ja,
    description:
      'みんなが集まれるのはいつ？カレンダーで行ける日を選ぶだけ。登録もトラッキングもなし。',
    previewOpen: (answers: number): string =>
      answers === 0
        ? '行ける日を選んでね。登録は不要。'
        : `行ける日を選んでね · 回答は現在${answers}人`,
    previewDecided: (when: string): string => `日程決定：${when}`,
    previewClosed: 'この予定の受付は終了しました。',
    previewImageAlt: 'カレンダーを持つフクロウ',
    previewCalendarAlt: '候補日のカレンダー。行ける人の数で色分け',
    previewMoreDays: (days: number): string => `ほか${days}日`,
    calendarNote: 'Owl Be Thereで決めた日程',
  },
  ko: {
    appName: APP_NAME,
    tagline: TAGLINES.ko,
    description:
      '모두 언제 시간이 될까요? 캘린더에 가능한 날짜를 표시하기만 하면 돼요. 가입도 추적도 없어요.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? '가능한 날짜를 표시하세요. 가입은 필요 없어요.'
        : `가능한 날짜를 표시하세요 · 지금까지 응답 ${answers}개`,
    previewDecided: (when: string): string => `날짜 확정: ${when}`,
    previewClosed: '이 투표는 마감되었어요.',
    previewImageAlt: '캘린더를 든 부엉이',
    previewCalendarAlt: '가능한 인원에 따라 색을 칠한 후보 날짜 캘린더',
    previewMoreDays: (days: number): string => `+ ${days}일 더`,
    calendarNote: 'Owl Be There로 정한 날짜',
  },
  nb: {
    appName: APP_NAME,
    tagline: TAGLINES.nb,
    description:
      'Når kan alle møtes? Marker dagene som passer i kalenderen, og finn ut av det. Ingen registrering eller sporing.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Marker dagene du kan. Ingen registrering nødvendig.'
        : `Marker dagene du kan · ${answers} svar så langt`,
    previewDecided: (when: string): string => `Datoen er bestemt: ${when}`,
    previewClosed: 'Avstemningen er avsluttet.',
    previewImageAlt: 'En ugle med en kalender',
    previewCalendarAlt:
      'Mulige dager i en kalender, fargelagte etter hvor mange som kan delta',
    previewMoreDays: (days: number): string =>
      `+ ${days} ${days === 1 ? 'dag til' : 'dager til'}`,
    calendarNote: 'Dato valgt med Owl Be There',
  },
  nl: {
    appName: APP_NAME,
    tagline: TAGLINES.nl,
    description:
      'Wanneer kan iedereen? Vul je dagen in op de kalender en ontdek het. Zonder aanmelden of tracking.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Vul in wanneer je kunt. Aanmelden hoeft niet.'
        : `Vul in wanneer je kunt · tot nu toe ${answers} ${answers === 1 ? 'antwoord' : 'antwoorden'}`,
    previewDecided: (when: string): string => `De datum staat vast: ${when}`,
    previewClosed: 'Deze poll is gesloten.',
    previewImageAlt: 'Een uil met een kalender',
    previewCalendarAlt:
      'De mogelijke dagen op een kalender, gekleurd naar hoeveel mensen kunnen',
    previewMoreDays: (days: number): string =>
      `+ ${days} ${days === 1 ? 'andere dag' : 'andere dagen'}`,
    calendarNote: 'Datum gekozen met Owl Be There',
  },
  pl: {
    appName: APP_NAME,
    tagline: TAGLINES.pl,
    description:
      'Kiedy wszyscy mają czas? Zaznacz dostępne dni w kalendarzu i znajdź dogodny termin. Bez rejestracji i śledzenia.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Zaznacz dni, w które możesz przyjść. Bez rejestracji.'
        : `Zaznacz dni, w które możesz przyjść · dotąd ${answers} ${answers === 1 ? 'odpowiedź' : 'odpowiedzi'}`,
    previewDecided: (when: string): string => `Termin ustalony: ${when}`,
    previewClosed: 'Głosowanie nad terminem jest zamknięte.',
    previewImageAlt: 'Sowa trzymająca kalendarz',
    previewCalendarAlt:
      'Kalendarz proponowanych dni, których kolor zależy od liczby dostępnych osób',
    previewMoreDays: (days: number): string =>
      `+ ${days} ${days === 1 ? 'dzień' : 'dni'} więcej`,
    calendarNote: 'Termin wybrany za pomocą Owl Be There',
  },
  pt: {
    appName: APP_NAME,
    tagline: TAGLINES.pt,
    description:
      'Quando é que todos podem? Marca os teus dias no calendário e descobre. Sem registo nem rastreio.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Marca os dias em que podes. Sem registo.'
        : `Marca os dias em que podes · ${answers} ${answers === 1 ? 'resposta' : 'respostas'} até agora`,
    previewDecided: (when: string): string => `A data está marcada: ${when}`,
    previewClosed: 'Esta votação está encerrada.',
    previewImageAlt: 'Uma coruja com um calendário',
    previewCalendarAlt:
      'Os dias possíveis num calendário, coloridos conforme quantos podem',
    previewMoreDays: (days: number): string =>
      `+ ${days} ${days === 1 ? 'outro dia' : 'outros dias'}`,
    calendarNote: 'Data escolhida com Owl Be There',
  },
  'pt-BR': {
    appName: APP_NAME,
    tagline: TAGLINES['pt-BR'],
    description:
      'Quando todo mundo pode? Marque seus dias no calendário e descubra. Sem cadastro nem rastreamento.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Marque os dias em que você pode. Sem cadastro.'
        : `Marque os dias em que você pode · ${answers} ${answers === 1 ? 'resposta' : 'respostas'} até agora`,
    previewDecided: (when: string): string => `A data está definida: ${when}`,
    previewClosed: 'Esta votação está encerrada.',
    previewImageAlt: 'Uma coruja com um calendário',
    previewCalendarAlt:
      'Os dias possíveis em um calendário, coloridos conforme quantas pessoas podem',
    previewMoreDays: (days: number): string =>
      `+ ${days} ${days === 1 ? 'outro dia' : 'outros dias'}`,
    calendarNote: 'Data definida com o Owl Be There',
  },
  ru: {
    appName: APP_NAME,
    tagline: TAGLINES.ru,
    description:
      'Когда всем удобно? Отметь свои дни в календаре и узнай. Без регистрации и отслеживания.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Отметь дни, когда можешь прийти. Регистрация не нужна.'
        : `Отметь дни, когда можешь прийти · пока ${answers} ${russianForm(answers, 'ответ', 'ответа', 'ответов')}`,
    previewDecided: (when: string): string => `Дата выбрана: ${when}`,
    previewClosed: 'Голосование закрыто.',
    previewImageAlt: 'Сова с календарём',
    previewCalendarAlt:
      'Возможные дни в календаре: цвет показывает, сколько человек могут прийти',
    previewMoreDays: (days: number): string =>
      `+ ещё ${days} ${russianForm(days, 'день', 'дня', 'дней')}`,
    calendarNote: 'Дата выбрана с помощью Owl Be There',
  },
  sv: {
    appName: APP_NAME,
    tagline: TAGLINES.sv,
    description:
      'När kan alla? Markera de dagar som passar i kalendern och ta reda på det. Ingen registrering eller spårning.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Markera de dagar du kan. Ingen registrering behövs.'
        : `Markera de dagar du kan · ${answers} svar hittills`,
    previewDecided: (when: string): string => `Datumet är bestämt: ${when}`,
    previewClosed: 'Omröstningen är avslutad.',
    previewImageAlt: 'En uggla med en kalender',
    previewCalendarAlt:
      'Möjliga dagar i en kalender, färgade efter hur många som kan delta',
    previewMoreDays: (days: number): string =>
      `+ ${days} ${days === 1 ? 'dag till' : 'dagar till'}`,
    calendarNote: 'Datum valt med Owl Be There',
  },
  tr: {
    appName: APP_NAME,
    tagline: TAGLINES.tr,
    description:
      'Herkes ne zaman gelebilir? Günlerini takvimde işaretle ve öğren. Kayıt yok, takip yok.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Uygun günlerini işaretle. Kayıt gerekmez.'
        : `Uygun günlerini işaretle · şimdiye kadar ${answers} yanıt`,
    previewDecided: (when: string): string => `Tarih belirlendi: ${when}`,
    previewClosed: 'Tarih oylaması kapandı.',
    previewImageAlt: 'Takvim tutan bir baykuş',
    previewCalendarAlt:
      'Katılabilecek kişi sayısına göre renklendirilmiş aday günleri gösteren takvim',
    previewMoreDays: (days: number): string => `+ ${days} gün daha`,
    calendarNote: 'Tarih Owl Be There ile belirlendi',
  },
  uk: {
    appName: APP_NAME,
    tagline: TAGLINES.uk,
    description:
      'Коли всі можуть? Познач свої дні в календарі й дізнайся. Без реєстрації та стеження.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Познач дні, коли можеш. Реєстрація не потрібна.'
        : `Познач дні, коли можеш · поки що ${answers} ${russianForm(answers, 'відповідь', 'відповіді', 'відповідей')}`,
    previewDecided: (when: string): string => `Дату обрано: ${when}`,
    previewClosed: 'Голосування закрито.',
    previewImageAlt: 'Сова з календарем',
    previewCalendarAlt:
      'Можливі дні в календарі: колір показує, скільки людей можуть прийти',
    previewMoreDays: (days: number): string =>
      `+ ще ${days} ${russianForm(days, 'день', 'дні', 'днів')}`,
    calendarNote: 'Дату обрано за допомогою Owl Be There',
  },
  ur: {
    appName: APP_NAME,
    tagline: TAGLINES.ur,
    description:
      'سب کب آ سکتے ہیں؟ کیلنڈر پر اپنے دن نشان زد کریں اور جان لیں۔ نہ رجسٹریشن، نہ ٹریکنگ۔',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'اپنے دن نشان زد کریں۔ رجسٹریشن کی ضرورت نہیں۔'
        : `اپنے دن نشان زد کریں، اب تک ${answers} ${answers === 1 ? 'جواب' : 'جوابات'}`,
    previewDecided: (when: string): string => `تاریخ طے ہو گئی: ${when}`,
    previewClosed: 'ووٹنگ بند ہو چکی ہے۔',
    previewImageAlt: 'کیلنڈر کے ساتھ ایک الو',
    previewCalendarAlt:
      'کیلنڈر میں ممکنہ دن، جن کا رنگ بتاتا ہے کہ کتنے لوگ آ سکتے ہیں',
    // No plus sign: Noto Sans Arabic has none.
    previewMoreDays: (days: number): string => `مزید ${days} دن`,
    calendarNote: 'تاریخ Owl Be There کے ذریعے طے کی گئی',
  },
  vi: {
    appName: APP_NAME,
    tagline: TAGLINES.vi,
    description:
      'Khi nào mọi người đều rảnh? Đánh dấu ngày bạn đi được trên lịch và tìm ra ngày phù hợp. Không cần đăng ký, không theo dõi.',
    previewOpen: (answers: number): string =>
      answers === 0
        ? 'Đánh dấu những ngày bạn đi được. Không cần đăng ký.'
        : `Đánh dấu những ngày bạn đi được · đã có ${answers} câu trả lời`,
    previewDecided: (when: string): string => `Đã chốt ngày: ${when}`,
    previewClosed: 'Bình chọn này đã đóng.',
    previewImageAlt: 'Một chú cú ôm cuốn lịch',
    previewCalendarAlt:
      'Các ngày đề xuất trên lịch, tô màu theo số người đi được',
    previewMoreDays: (days: number): string => `+ ${days} ngày nữa`,
    calendarNote: 'Chốt ngày bằng Owl Be There',
  },
  'zh-Hans': {
    appName: APP_NAME,
    tagline: TAGLINES['zh-Hans'],
    description:
      '大家什么时候有空？在日历上标记方便的日期，找到适合大家的日子。无需注册，也不会追踪你。',
    previewOpen: (answers: number): string =>
      answers === 0
        ? '标记你方便的日期，无需注册。'
        : `标记你方便的日期 · 已有 ${answers} 份回复`,
    previewDecided: (when: string): string => `日期已确定：${when}`,
    previewClosed: '日期投票已关闭。',
    previewImageAlt: '带着日历的猫头鹰',
    previewCalendarAlt: '用颜色显示各候选日期可参加人数的日历',
    previewMoreDays: (days: number): string => `另有 ${days} 天`,
    calendarNote: '使用 Owl Be There 确定日期',
  },
  'zh-Hant': {
    appName: APP_NAME,
    tagline: TAGLINES['zh-Hant'],
    description:
      '大家哪天有空？在日曆上標記方便的日期，找出適合大家的日子。無須註冊，也不會追蹤你。',
    previewOpen: (answers: number): string =>
      answers === 0
        ? '標記你方便的日期，無須註冊。'
        : `標記你方便的日期 · 目前有 ${answers} 份回覆`,
    previewDecided: (when: string): string => `日期已定：${when}`,
    previewClosed: '日期投票已關閉。',
    previewImageAlt: '拿著日曆的貓頭鷹',
    previewCalendarAlt: '以顏色顯示各候選日可參加人數的日曆',
    previewMoreDays: (days: number): string => `另有 ${days} 天`,
    calendarNote: '透過 Owl Be There 選定日期',
  },
} as const satisfies Record<Language, unknown>;

/**
 * The sentence under a poll's title in link previews and in the preview
 * picture: the date once it is chosen, else that the poll is closed, else the
 * invitation to answer. A closed poll refuses answers, so it must not invite
 * anyone to give one.
 */
export function previewStatus(
  texts: (typeof SERVER_TEXTS)[Language],
  data: EventSnapshotData,
  locale: string
): string {
  const { event } = data;
  if (event.finalStart !== null && event.finalEnd !== null) {
    return texts.previewDecided(
      formatDayRange(event.finalStart, event.finalEnd, locale)
    );
  }
  if (event.status === 'closed') return texts.previewClosed;
  return texts.previewOpen(data.participants.filter((p) => p.answered).length);
}
