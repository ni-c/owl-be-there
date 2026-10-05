import { addDays, basicDate, type ISODate } from './dates.js';

/** The chosen date of an event, as a calendar entry. */
export interface CalendarEntry {
  /** Stable across downloads, so importing twice updates instead of duplicating. */
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  start: ISODate;
  /** Inclusive — the last day of the event. */
  end: ISODate;
  url: string | null;
}

/** RFC 5545 text escaping: backslash, semicolon, comma and line breaks. */
export function escapeIcsText(text: string): string {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/u;

const encoder = new TextEncoder();

/**
 * Fold a content line at 75 octets, as RFC 5545 asks.
 *
 * Octets, not characters — and never inside a character: the cut is made
 * between code points, so an emoji in a title is never split into two halves
 * that some calendar apps then show as two broken glyphs.
 */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let size = 0;
  // The first line may hold 75 octets; continuations start with a space,
  // which counts, so they hold 74 more.
  let limit = 75;
  for (const char of line) {
    const width = encoder.encode(char).length;
    if (size + width > limit) {
      parts.push(current);
      current = '';
      size = 0;
      limit = 74;
    }
    current += char;
    size += width;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** A UTC timestamp in the basic format, e.g. `20270308T091500Z`. */
function stamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * An all-day event as an `.ics` file.
 *
 * `DTEND` is exclusive for all-day events — a one-day event on the 8th ends on
 * the 9th — which is the detail that most hand-written calendar files get
 * wrong, and Outlook then shows the event one day short.
 */
export function buildIcs(entry: CalendarEntry, now: Date): string {
  // These two are written as they are, so a line break in one would start a
  // new property in the file.
  for (const value of [entry.uid, entry.url]) {
    if (value !== null && CONTROL_CHARACTER.test(value))
      throw new RangeError(
        'A calendar uid or url must not hold control characters'
      );
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Owl Be There//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${entry.uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${basicDate(entry.start)}`,
    `DTEND;VALUE=DATE:${basicDate(addDays(entry.end, 1))}`,
    `SUMMARY:${escapeIcsText(entry.title)}`,
  ];
  if (entry.description)
    lines.push(`DESCRIPTION:${escapeIcsText(entry.description)}`);
  if (entry.location) lines.push(`LOCATION:${escapeIcsText(entry.location)}`);
  if (entry.url) lines.push(`URL:${entry.url}`);
  lines.push('TRANSP:OPAQUE', 'END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

/**
 * Angle brackets become single angle quotation marks: Google reads the
 * `details` of a template link as limited HTML, and what the organiser typed
 * must stay plain text.
 */
function plainDetails(text: string): string {
  return text.replaceAll('<', '\u2039').replaceAll('>', '\u203A');
}

/** A link that opens Google Calendar with the event filled in. */
export function googleCalendarUrl(entry: Omit<CalendarEntry, 'uid'>): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: entry.title,
    // Exclusive end, as in the file.
    dates: `${basicDate(entry.start)}/${basicDate(addDays(entry.end, 1))}`,
  });
  const details = [
    entry.description && plainDetails(entry.description),
    entry.url,
  ]
    .filter(Boolean)
    .join('\n\n');
  if (details) params.set('details', details);
  if (entry.location) params.set('location', entry.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
