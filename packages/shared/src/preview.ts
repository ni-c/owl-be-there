import {
  addDays,
  compareISODate,
  formatDay,
  utcDateOf,
  type ISODate,
} from './dates.js';
import { buildWeeks } from './grid.js';
import { heatLevel, heatOf, tally, type Respondent } from './ranking.js';
import type { EventSnapshotData } from './schemas.js';
import { formatDayRange, LOCALES, SERVER_TEXTS } from './texts.js';

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

/** At most this many week rows; a longer poll shows its first weeks. */
export const PREVIEW_MAX_WEEKS = 6;

/** The light theme's colours, as in the client's stylesheet. */
const COLOURS = {
  bg: '#fbf6ee',
  surface: '#ffffff',
  sunken: '#f4ece0',
  line: '#e6dac6',
  ink: '#2a2118',
  muted: '#6b5b4a',
  brand: '#b5541c',
  heat: ['#f1e8da', '#6fbc9f', '#4aa685', '#268262', '#1a7055', '#0e5441'],
  heatInkLow: '#10261d',
  heatInkHigh: '#ffffff',
} as const;

/** The font stack the server loads; CJK only falls in where Nunito has no glyph. */
export const PREVIEW_FONTS = "Nunito, 'Noto Sans CJK JP'";

export interface PreviewOptions {
  /** Shown at the bottom, e.g. `owlbethere.app`. */
  host: string;
  /** The owl as an SVG data URI, or null to leave it out. */
  owl: string | null;
}

export interface PreviewCell {
  day: ISODate;
  /** 0–5 for a candidate day, null for a day around it. */
  level: number | null;
  /** Part of the chosen date. */
  chosen: boolean;
}

/** The calendar rows of the picture, each seven days long. */
export function previewWeeks(data: EventSnapshotData): PreviewCell[][] {
  const { event } = data;
  const candidates = new Set(event.days);
  const people: Respondent[] = data.participants.map((p) => ({
    id: p.id,
    answered: p.answered,
    yes: new Set(p.yes),
    maybe: new Set(p.maybe),
    unseen: new Set(p.unseen),
  }));
  const firstWeekday = event.language === 'ja' ? 6 : 0;
  const chosen = (day: ISODate): boolean =>
    event.finalStart !== null &&
    event.finalEnd !== null &&
    compareISODate(day, event.finalStart) >= 0 &&
    compareISODate(day, event.finalEnd) <= 0;
  return buildWeeks(event.days, firstWeekday)
    .slice(0, PREVIEW_MAX_WEEKS)
    .map((row) =>
      row.days.map((day) => ({
        day,
        level: candidates.has(day)
          ? heatLevel(heatOf(tally(people, [day])))
          : null,
        chosen: chosen(day),
      }))
    );
}

export function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Rough width of a character in em: SVG has no text measuring. */
function charWidth(char: string): number {
  const code = char.codePointAt(0)!;
  if (code >= 0x2e80) return 1; // CJK and other full-width scripts
  if (char === ' ') return 0.26;
  if (/[A-ZÄÖÜÉÈÀ0-9MW@#%&]/.test(char)) return 0.68;
  return 0.54;
}

/**
 * Break text into at most `maxLines` lines that fit `maxWidth` pixels at
 * `fontSize`, cutting the last one with an ellipsis. Words longer than a
 * line, and scripts without spaces, break between characters.
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
  let line: string[] = [];
  let width = 0;
  let lastSpace = -1;
  for (const char of chars) {
    const w = charWidth(char);
    if (width + w > limit && line.length > 0) {
      let rest: string[] = [];
      if (char !== ' ' && lastSpace > 0) {
        rest = line.slice(lastSpace + 1);
        line = line.slice(0, lastSpace);
      }
      lines.push(line.join('').trimEnd());
      line = char === ' ' ? [...rest] : [...rest, char];
      width = line.reduce((sum, c) => sum + charWidth(c), 0);
      lastSpace = line.lastIndexOf(' ');
      continue;
    }
    if (char === ' ') lastSpace = line.length;
    line.push(char);
    width += w;
  }
  if (line.length > 0) lines.push(line.join('').trim());
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = [...kept[maxLines - 1]!];
  const ellipsis = charWidth('…');
  while (
    last.length > 0 &&
    last.reduce((sum, c) => sum + charWidth(c), 0) + ellipsis > limit
  )
    last.pop();
  kept[maxLines - 1] = `${last.join('').trimEnd()}…`;
  return kept;
}

/** The whole picture, as an SVG document. */
export function previewSvg(
  data: EventSnapshotData,
  options: PreviewOptions
): string {
  const { event } = data;
  const texts = SERVER_TEXTS[event.language];
  const locale = LOCALES[event.language];
  const e = escapeXml;
  const answers = data.participants.filter((p) => p.answered).length;
  const status =
    event.finalStart !== null && event.finalEnd !== null
      ? texts.previewDecided(
          formatDayRange(event.finalStart, event.finalEnd, locale)
        )
      : texts.previewOpen(answers);

  const left = 72;
  const columnWidth = 590;
  const parts: string[] = [];

  // Brand line.
  if (options.owl)
    parts.push(
      `<image href="${e(options.owl)}" x="${left}" y="56" width="68" height="70"/>`
    );
  parts.push(
    `<text x="${options.owl ? left + 84 : left}" y="104" font-size="34" font-weight="800" fill="${COLOURS.brand}">${e(texts.appName)}</text>`
  );

  // Title, up to three lines, then the state of the poll.
  const titleSize = 60;
  const titleLines = wrapText(event.title, columnWidth, titleSize, 3);
  let y = 214;
  for (const line of titleLines) {
    parts.push(
      `<text x="${left}" y="${y}" font-size="${titleSize}" font-weight="800" fill="${COLOURS.ink}">${e(line)}</text>`
    );
    y += 70;
  }
  y += 8;
  for (const line of wrapText(status, columnWidth, 30, 3)) {
    parts.push(
      `<text x="${left}" y="${y}" font-size="30" fill="${COLOURS.muted}">${e(line)}</text>`
    );
    y += 42;
  }
  parts.push(
    `<text x="${left}" y="566" font-size="28" font-weight="800" fill="${COLOURS.muted}">${e(options.host)}</text>`
  );

  // The calendar panel.
  const weeks = previewWeeks(data);
  const panelX = 696;
  const panelY = 48;
  const panelW = 456;
  const panelH = 534;
  const cell = 52;
  const gap = 8;
  const gridW = 7 * cell + 6 * gap;
  const gridX = panelX + (panelW - gridW) / 2;
  parts.push(
    `<rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="36" fill="${COLOURS.surface}" stroke="${COLOURS.line}" stroke-width="2"/>`
  );
  // The calendar block — month line, weekday letters, rows — centred in
  // the panel, however many weeks it has.
  const blockH = 64 + 48 + weeks.length * (cell + gap);
  const top = panelY + Math.max(36, (panelH - blockH) / 2);
  const shown = weeks.flat().filter((c) => c.level !== null);
  if (shown.length > 0) {
    const months = monthRange(
      shown[0]!.day,
      shown[shown.length - 1]!.day,
      locale
    );
    // Smaller rather than cut off: "October 2026 – January 2027" is long.
    const size = Math.min(
      30,
      Math.floor((gridW / textWidth(months, 1)) * 0.95)
    );
    parts.push(
      `<text x="${panelX + panelW / 2}" y="${top + 36}" font-size="${size}" font-weight="800" text-anchor="middle" fill="${COLOURS.ink}">${e(months)}</text>`
    );
  }
  const headY = top + 96;
  const rowStart = weeks[0]?.[0]?.day;
  if (rowStart)
    for (let index = 0; index < 7; index += 1) {
      const name = formatDay(addDays(rowStart, index), locale, {
        weekday: 'narrow',
      });
      parts.push(
        `<text x="${gridX + index * (cell + gap) + cell / 2}" y="${headY}" font-size="22" font-weight="800" text-anchor="middle" fill="${COLOURS.muted}">${e(name)}</text>`
      );
    }
  weeks.forEach((row, rowIndex) => {
    const cy = headY + 20 + rowIndex * (cell + gap);
    row.forEach((c, index) => {
      const cx = gridX + index * (cell + gap);
      const number = formatDay(c.day, locale, { day: 'numeric' }).replace(
        /\D+$/,
        ''
      );
      if (c.level === null) {
        parts.push(
          `<text x="${cx + cell / 2}" y="${cy + 34}" font-size="22" text-anchor="middle" fill="${COLOURS.line}">${e(number)}</text>`
        );
        return;
      }
      const fill = COLOURS.heat[c.level]!;
      const ink = c.level >= 3 ? COLOURS.heatInkHigh : COLOURS.heatInkLow;
      const stroke = c.chosen
        ? ` stroke="${COLOURS.brand}" stroke-width="5"`
        : c.level === 0
          ? ` stroke="${COLOURS.line}" stroke-width="2"`
          : '';
      parts.push(
        `<rect x="${cx}" y="${cy}" width="${cell}" height="${cell}" rx="14" fill="${fill}"${stroke}/>`,
        `<text x="${cx + cell / 2}" y="${cy + 34}" font-size="22" font-weight="800" text-anchor="middle" fill="${ink}">${e(number)}</text>`
      );
    });
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}" font-family="${PREVIEW_FONTS}">`,
    `<rect width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" fill="${COLOURS.bg}"/>`,
    ...parts,
    '</svg>',
  ].join('\n');
}

/**
 * "October 2026", or "October – November 2026" across months. Japanese is put
 * together by hand: ICU writes the range as "2026/10～2026/11".
 */
export function monthRange(
  first: ISODate,
  last: ISODate,
  locale: string
): string {
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
  const full = format({ month: 'long', year: 'numeric' });
  if (!locale.startsWith('ja'))
    return full.formatRange(utcDateOf(first), utcDateOf(last));
  const start = full.format(utcDateOf(first));
  const end = (
    first.slice(0, 4) === last.slice(0, 4) ? format({ month: 'long' }) : full
  ).format(utcDateOf(last));
  return first.slice(0, 7) === last.slice(0, 7) ? start : `${start}～${end}`;
}

/** The estimated width of a text in pixels, the way `wrapText` counts. */
export function textWidth(text: string, fontSize: number): number {
  return [...text].reduce((sum, char) => sum + charWidth(char), 0) * fontSize;
}

/** Whether the title or the language needs the CJK font. */
export function previewNeedsCjk(data: EventSnapshotData): boolean {
  return (
    data.event.language === 'ja' ||
    [...data.event.title].some((char) => char.codePointAt(0)! >= 0x2e80)
  );
}
