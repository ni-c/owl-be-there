import {
  addDays,
  compareISODate,
  dayFormatter,
  formatDay,
  utcDateOf,
  type ISODate,
} from './dates.js';
import { normalizeDays } from './candidates.js';
import { buildWeeks } from './grid.js';
import { heatLevel, heatOf, respondentOf, tally } from './ranking.js';
import type { EventSnapshotData } from './schemas.js';
import { escapeMarkup } from './text.js';
import {
  APP_NAME,
  isRtl,
  LOCALES,
  previewStatus,
  SERVER_TEXTS,
} from './texts.js';
import { weekdayColumnHeading } from './weekday.js';

/**
 * The picture link previews show for an event: its title, the state of the
 * poll in words, and the candidate days as a small calendar coloured like the
 * heatmap. A snapshot — messengers fetch it once, when the link is sent.
 *
 * Only what anyone with the link sees anyway, and less: no names, and never
 * the description. The server turns the SVG into a PNG.
 */

export const PREVIEW_WIDTH = 1200;
export const PREVIEW_HEIGHT = 630;

/** At most this many week rows; a longer poll shows this many weeks around its best day. */
export const PREVIEW_MAX_WEEKS = 6;

/** The light theme's colours; a test ties them to the client's stylesheet. */
export const PREVIEW_COLOURS = {
  bg: '#fbf6ee',
  surface: '#ffffff',
  line: '#e6dac6',
  ink: '#2a2118',
  muted: '#6b5b4a',
  brand: '#b5541c',
  heat: ['#f1e8da', '#6fbc9f', '#4aa685', '#268262', '#1a7055', '#0e5441'],
  heatInkLow: '#10261d',
  heatInkHigh: '#ffffff',
} as const;

/** The font stack the server loads; CJK only falls in where Nunito has no glyph. */
const PREVIEW_FONTS =
  "Nunito, 'Noto Sans CJK SC', 'Noto Sans CJK JP', 'Noto Sans Arabic'";

export interface PreviewOptions {
  /** Shown at the bottom, e.g. `owlbethere.app`. */
  host: string;
  /** The owl as an SVG data URI, or null to leave it out. */
  owl: string | null;
}

interface PreviewCell {
  day: ISODate;
  /** 0–5 for a candidate day, null for a day around it. */
  level: number | null;
  /** Part of the chosen date. */
  chosen: boolean;
}

export interface PreviewCalendar {
  /** The rows shown, each seven days long. */
  weeks: PreviewCell[][];
  /** Candidate days left out of a long poll. */
  hidden: number;
  /** The first and last candidate day of the whole poll. */
  first: ISODate;
  last: ISODate;
}

/**
 * The calendar of the picture. A poll of up to six weeks is shown whole; a
 * longer one shows the six weeks around its best day — the chosen date once
 * there is one, else the day most can make (the earliest of equals, so a poll
 * nobody has answered shows its first weeks).
 */
export function previewCalendar(data: EventSnapshotData): PreviewCalendar {
  const { event } = data;
  const candidates = new Set(event.days);
  const people = data.participants.map(respondentOf);
  const respondents = people.filter((p) => p.answered).length;
  const heat = new Map(
    [...candidates].map((day) => [
      day,
      heatOf(tally(people, [day]), respondents),
    ])
  );
  const firstWeekday =
    event.language === 'ja' || event.language === 'ko' ? 6 : 0;
  const chosen = (day: ISODate): boolean =>
    event.finalStart !== null &&
    event.finalEnd !== null &&
    compareISODate(day, event.finalStart) >= 0 &&
    compareISODate(day, event.finalEnd) <= 0;
  const rows = buildWeeks(event.days, firstWeekday);
  const sorted = normalizeDays(candidates);

  let from = 0;
  if (rows.length > PREVIEW_MAX_WEEKS) {
    let best = event.finalStart;
    if (best === null)
      for (const day of sorted)
        if (best === null || heat.get(day)! > heat.get(best)!) best = day;
    const bestRow = rows.findIndex((row) => row.days.includes(best!));
    // The best week second or third from the top, with weeks before it for
    // context — unless the poll begins or ends there.
    from = Math.min(Math.max(0, bestRow - 2), rows.length - PREVIEW_MAX_WEEKS);
  }
  const weeks = rows.slice(from, from + PREVIEW_MAX_WEEKS).map((row) =>
    row.days.map((day) => ({
      day,
      level: candidates.has(day) ? heatLevel(heat.get(day)!) : null,
      chosen: chosen(day),
    }))
  );
  const shown = weeks.flat().filter((cell) => cell.level !== null).length;
  return {
    weeks,
    hidden: candidates.size - shown,
    first: sorted[0]!,
    last: sorted[sorted.length - 1]!,
  };
}

/** CJK and other full-width scripts, which break between any two characters. */
const isFullWidth = (char: string): boolean => char.codePointAt(0)! >= 0x2e80;

/** Joiners, variation selectors and tags: no glyph of their own. */
const INVISIBLE =
  /\u200B|\u200C|\u200D|\u2060|[\uFE00-\uFE0F]|[\u{E0000}-\u{E007F}]/u;
/** Symbols only the CJK font draws, a full em wide; Nunito has (c), (r), TM and the minus. */
const CJK_SYMBOL =
  /(?![\u00A9\u00AE\u2122])[\p{Extended_Pictographic}\u2190-\u2211\u2216-\u2BFF\u{1F100}-\u{1F2FF}]/u;

/**
 * Rough width of a character in em: SVG has no text measuring. The four wide
 * Latin letters are measured from the rendered font at weight 800, Cyrillic
 * from the picture as it is drawn; the rest of the Latin alphabet sits close
 * to one average.
 */
function charWidth(char: string): number {
  if (INVISIBLE.test(char)) return 0;
  if (/\p{scx=Arabic}/u.test(char)) return 0.65;
  if (isFullWidth(char) || CJK_SYMBOL.test(char)) return 1;
  if (char === ' ') return 0.26;
  if (/\p{scx=Greek}/u.test(char)) return 0.7;
  if (char === 'W') return 1.1;
  if (char === 'M') return 0.95;
  if (char === 'm') return 0.9;
  if (char === 'w') return 0.8;
  if (/\p{Script=Cyrillic}/u.test(char)) {
    if (/\p{Lu}/u.test(char)) return /[ЖШЩЮ]/.test(char) ? 1 : 0.76;
    return /[жфшщыю]/.test(char) ? 0.8 : 0.56;
  }
  if (/[A-ZÄÖÜÉÈÀ0-9@#%&]/.test(char)) return 0.68;
  return 0.54;
}

/** Characters that do not begin a line in CJK text: closing marks, stops, the long vowel mark, small kana. */
const NO_LINE_START = new Set([
  ...'、。，．：；！？）］｝〕〉》」』】〙〗〟’”‥…・ー々〻ゝゞヽヾ',
  ...'ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ',
  ...'),.!?:;]}',
]);
/** Characters that do not end a line: opening marks. */
const NO_LINE_END = new Set([...'（［｛〔〈《「『【〘〖〝‘“([{']);

/**
 * Break text into at most `maxLines` lines that fit `maxWidth` pixels at
 * `fontSize`, cutting the last one with an ellipsis. Words longer than a
 * line, and scripts without spaces, break between characters; a run of digits
 * or letters among such characters, a date in Japanese, moves down whole.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number
): string[] {
  const limit = maxWidth / fontSize;
  const chars = [...text.trim().replace(/\s+/g, ' ')];
  const lines: string[] = [];
  // The line being filled starts at `start`; when a character does not fit,
  // the word it is in moves to the next line and is measured again from there.
  let start = 0;
  let width = 0;
  let lastSpace = -1;
  let i = 0;
  while (i < chars.length) {
    const char = chars[i]!;
    const w = charWidth(char);
    if (width + w > limit && i > start) {
      const wordBreak = char !== ' ' && lastSpace > start;
      const cut = wordBreak ? lastSpace : i;
      let end = cut;
      // No space on the line: break before the narrow run at its end (a date).
      if (!wordBreak && char !== ' ') {
        let run = i;
        while (run > start && !isFullWidth(chars[run - 1]!)) run -= 1;
        if (run > start) end = run;
      }
      // "28日(日)": the day with its number moves down, not "(日)" alone.
      if (chars[end] === '(' && isFullWidth(chars[end - 1] ?? '')) {
        let k = end - 1;
        while (k > start && /\p{Nd}/u.test(chars[k - 1]!)) k -= 1;
        if (k > start) end = k;
      }
      // Kinsoku: a closing mark never starts a line, an opening one never ends it.
      while (
        end > start + 1 &&
        (NO_LINE_START.has(chars[end]!) || NO_LINE_END.has(chars[end - 1]!))
      )
        end -= 1;
      lines.push(chars.slice(start, end).join('').trimEnd());
      // The space the break was fixed at is not carried over; but once kinsoku
      // has pulled `end` back before it, what was pulled back starts the next line.
      start =
        end < cut
          ? end
          : wordBreak
            ? lastSpace + 1
            : char === ' '
              ? i + 1
              : end;
      width = 0;
      lastSpace = -1;
      i = start;
      continue;
    }
    if (char === ' ') lastSpace = i;
    width += w;
    i += 1;
  }
  if (start < chars.length) lines.push(chars.slice(start).join('').trim());
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = [...kept[maxLines - 1]!];
  const ellipsis = charWidth('…');
  while (last.length > 0 && textWidth(last.join(''), 1) + ellipsis > limit)
    last.pop();
  kept[maxLines - 1] = `${last.join('').trimEnd()}…`;
  return kept;
}

/**
 * The bundled Noto Sans Arabic has no en or em dash, middle dot, parentheses,
 * plus sign, question mark, ellipsis or section sign, and resvg cannot borrow
 * one glyph from Nunito inside Arabic text: the whole line comes out as boxes.
 * A line with Arabic letters gets the hyphen, the Arabic comma and question
 * mark; "(5)" becomes ", 5," and a lone bracket, plus or section sign goes.
 */
// "(5)" → "، 5، " in one linear pass: a regex with \s* on both sides of the
// brackets backtracks quadratically over long runs of spaces.
function unbracket(line: string): string {
  let out = '';
  let from = 0;
  for (;;) {
    const open = line.indexOf('(', from);
    if (open < 0) return out + line.slice(from);
    const close = line.indexOf(')', open + 1);
    const nested = line.indexOf('(', open + 1);
    if (close < 0 || (nested >= 0 && nested < close)) {
      out += line.slice(from, open + 1);
      from = open + 1;
      continue;
    }
    const before = line.slice(from, open).trimEnd();
    let after = close + 1;
    while (after < line.length && /\s/.test(line[after]!)) after += 1;
    const atStart = out === '' && before === '';
    const atEnd = after >= line.length;
    out += `${before}${atStart ? '' : '، '}${line.slice(open + 1, close).trim()}${atEnd ? '' : '، '}`;
    from = after;
  }
}

export function arabicPunctuation(line: string): string {
  if (!/\p{scx=Arabic}/u.test(line)) return line;
  return unbracket(line)
    .replace(/[–—]/g, '-')
    .replace(/\s?·/g, '،')
    .replace(/\?/g, '؟')
    .replace(/…/g, '...')
    .replace(/[()+§]/g, '');
}

/**
 * A line with Arabic letters names the Arabic font first, so its weight is
 * matched like Nunito's instead of being left to resvg's fallback, which
 * drew bold Cyrillic in the regular weight.
 */
function arabicFont(line: string): string {
  return /\p{scx=Arabic}/u.test(line)
    ? ` font-family="'Noto Sans Arabic', Nunito"`
    : '';
}

/** The whole picture, as an SVG document. */
export function previewSvg(
  data: EventSnapshotData,
  options: PreviewOptions
): string {
  const { event } = data;
  const texts = SERVER_TEXTS[event.language];
  const locale = LOCALES[event.language];
  const e = escapeMarkup;
  const status = previewStatus(texts, data, locale);

  const rtl = isRtl(event.language);
  const left = rtl ? 1128 : 72;
  const textAttributes = rtl ? ' direction="rtl" text-anchor="end"' : '';
  const columnWidth = 590;
  const parts: string[] = [];
  const addLine = (
    line: string,
    lineY: number,
    size: number,
    weight: number,
    colour: string
  ): void => {
    const separateEllipsis = /\p{scx=Arabic}/u.test(line) && line.endsWith('…');
    const content = separateEllipsis ? line.slice(0, -1) : line;
    parts.push(
      `<text x="${left}" y="${lineY}" font-size="${size}" font-weight="${weight}"${arabicFont(content)} fill="${colour}"${textAttributes}>${e(arabicPunctuation(content))}</text>`
    );
    if (separateEllipsis) {
      const ellipsisX = left + (rtl ? -1 : 1) * (textWidth(content, size) + 8);
      parts.push(
        `<text x="${ellipsisX}" y="${lineY}" font-size="${size}" font-family="Nunito" fill="${colour}" text-anchor="${rtl ? 'end' : 'start'}">…</text>`
      );
    }
  };

  // Brand line.
  if (options.owl)
    parts.push(
      `<image href="${e(options.owl)}" x="${rtl ? 1060 : left}" y="56" width="68" height="70"/>`
    );
  parts.push(
    `<text x="${options.owl ? (rtl ? left - 84 : left + 84) : left}" y="104" font-size="34" font-weight="800" fill="${PREVIEW_COLOURS.brand}"${textAttributes}>${e(APP_NAME)}</text>`
  );

  // Title, up to three lines, then the state of the poll.
  const titleSize = 60;
  const titleLines = wrapText(event.title, columnWidth, titleSize, 3);
  let y = 214;
  for (const line of titleLines) {
    addLine(line, y, titleSize, 800, PREVIEW_COLOURS.ink);
    y += 70;
  }
  y += 8;
  for (const line of wrapText(status, columnWidth, 30, 3)) {
    addLine(line, y, 30, 400, PREVIEW_COLOURS.muted);
    y += 42;
  }
  parts.push(
    `<text x="${left}" y="566" font-size="28" font-weight="800" fill="${PREVIEW_COLOURS.muted}"${textAttributes}>${e(options.host)}</text>`
  );

  // The calendar panel.
  const calendar = previewCalendar(data);
  const { weeks } = calendar;
  const panelX = rtl ? 48 : 696;
  const panelY = 48;
  const panelW = 456;
  const panelH = 534;
  const cell = 52;
  const gap = 8;
  const gridW = 7 * cell + 6 * gap;
  const gridX = panelX + (panelW - gridW) / 2;
  parts.push(
    `<rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="36" fill="${PREVIEW_COLOURS.surface}" stroke="${PREVIEW_COLOURS.line}" stroke-width="2"/>`
  );
  // The calendar block — month line, weekday letters, rows — centred in
  // the panel, however many weeks it has.
  const more = calendar.hidden > 0 ? 44 : 0;
  const blockH = 52 + 40 + weeks.length * (cell + gap) + more;
  const top = panelY + Math.max(28, (panelH - blockH) / 2);
  {
    // The whole poll, even when only part of it is drawn.
    const months = monthRange(calendar.first, calendar.last, locale);
    // Smaller rather than cut off: "October 2026 – January 2027" is long.
    const size = Math.min(
      30,
      Math.floor((gridW / textWidth(months, 1)) * 0.95)
    );
    parts.push(
      `<text x="${panelX + panelW / 2}" y="${top + 36}" font-size="${size}" font-weight="800"${arabicFont(months)} text-anchor="middle" fill="${PREVIEW_COLOURS.ink}">${e(arabicPunctuation(months))}</text>`
    );
  }
  const headY = top + 84;
  // An event has at least one candidate day, so there is a first week.
  const rowStart = weeks[0]![0]!.day;
  // The app's column headings, in a size that fits the widest into a cell.
  const names = Array.from({ length: 7 }, (_, index) =>
    weekdayColumnHeading(addDays(rowStart, index), locale)
  );
  const headSize = Math.min(
    22,
    Math.floor(cell / Math.max(...names.map((name) => textWidth(name, 1))))
  );
  names.forEach((name, index) => {
    parts.push(
      `<text x="${gridX + (rtl ? 6 - index : index) * (cell + gap) + cell / 2}" y="${headY}" font-size="${headSize}" font-weight="800"${arabicFont(name)} text-anchor="middle" fill="${PREVIEW_COLOURS.muted}">${e(name)}</text>`
    );
  });
  weeks.forEach((row, rowIndex) => {
    const cy = headY + 20 + rowIndex * (cell + gap);
    row.forEach((c, index) => {
      const cx = gridX + (rtl ? 6 - index : index) * (cell + gap);
      // Without what follows the digits ("23日"); Persian digits are digits too.
      const number = formatDay(c.day, locale, { day: 'numeric' }).replace(
        /\P{Nd}+$/u,
        ''
      );
      if (c.level === null) {
        parts.push(
          `<text x="${cx + cell / 2}" y="${cy + 34}" font-size="22"${arabicFont(number)} text-anchor="middle" fill="${PREVIEW_COLOURS.line}">${e(number)}</text>`
        );
        return;
      }
      const fill = PREVIEW_COLOURS.heat[c.level]!;
      const ink =
        c.level >= 3 ? PREVIEW_COLOURS.heatInkHigh : PREVIEW_COLOURS.heatInkLow;
      const stroke = c.chosen
        ? ` stroke="${PREVIEW_COLOURS.brand}" stroke-width="5"`
        : c.level === 0
          ? ` stroke="${PREVIEW_COLOURS.line}" stroke-width="2"`
          : '';
      parts.push(
        `<rect x="${cx}" y="${cy}" width="${cell}" height="${cell}" rx="14" fill="${fill}"${stroke}/>`,
        `<text x="${cx + cell / 2}" y="${cy + 34}" font-size="22" font-weight="800"${arabicFont(number)} text-anchor="middle" fill="${ink}">${e(number)}</text>`
      );
    });
  });
  if (calendar.hidden > 0)
    parts.push(
      `<text x="${panelX + panelW / 2}" y="${headY + 20 + weeks.length * (cell + gap) + 28}" font-size="24" font-weight="800"${arabicFont(texts.previewMoreDays(calendar.hidden))} text-anchor="middle" fill="${PREVIEW_COLOURS.muted}">${e(arabicPunctuation(texts.previewMoreDays(calendar.hidden)))}</text>`
    );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}" font-family="${PREVIEW_FONTS}">`,
    `<rect width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" fill="${PREVIEW_COLOURS.bg}"/>`,
    ...parts,
    '</svg>',
  ].join('\n');
}

/**
 * "October 2026", or "October – November 2026" across months. Japanese and
 * Chinese are put together by hand: ICU writes the ranges as "2026/10～2026/11"
 * and "2026/10 – 2026/11".
 */
export function monthRange(
  first: ISODate,
  last: ISODate,
  locale: string
): string {
  const format = (options: Intl.DateTimeFormatOptions) =>
    dayFormatter(locale, options);
  const full = format({ month: 'long', year: 'numeric' });
  const joiner = locale.startsWith('ja')
    ? '～'
    : locale.startsWith('zh')
      ? '至'
      : null;
  if (joiner === null)
    return full.formatRange(utcDateOf(first), utcDateOf(last));
  const start = full.format(utcDateOf(first));
  // Within a year the end drops it; Chinese month names in words ("十一月")
  // are numerals again with the year on.
  const end = (
    first.slice(0, 4) === last.slice(0, 4) ? format({ month: 'numeric' }) : full
  ).format(utcDateOf(last));
  return first.slice(0, 7) === last.slice(0, 7)
    ? start
    : `${start}${joiner}${end}`;
}

/** The estimated width of a text in pixels, the way `wrapText` counts. */
export function textWidth(text: string, fontSize: number): number {
  return [...text].reduce((sum, char) => sum + charWidth(char), 0) * fontSize;
}

/**
 * Whether a code point is one the CJK font draws: ideographs and the scripts
 * around them, Hangul, compatibility ideographs, the full-width forms and the
 * supplementary ideograph planes. Emoji and symbols are not — that font has no
 * glyph for them, and loading it for one costs over a hundred megabytes.
 */
function isCjk(code: number): boolean {
  return (
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xffef) ||
    (code >= 0x20000 && code <= 0x3ffff)
  );
}

/** Whether the title or the language needs the CJK font. */
export function previewNeedsCjk(data: EventSnapshotData): boolean {
  return (
    data.event.language === 'ja' ||
    data.event.language === 'ko' ||
    data.event.language === 'zh-Hant' ||
    data.event.language === 'zh-Hans' ||
    [...data.event.title].some((char) => isCjk(char.codePointAt(0)!))
  );
}
