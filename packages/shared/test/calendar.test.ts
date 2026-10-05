import { describe, expect, it } from 'vitest';
import {
  buildIcs,
  escapeIcsText,
  foldIcsLine,
  googleCalendarUrl,
  type CalendarEntry,
} from '../src/index.js';

const entry: CalendarEntry = {
  uid: '7gT4kPq2Wx9Z@owl.example.org',
  title: 'Summer tournament',
  description: null,
  location: null,
  start: '2027-03-06',
  end: '2027-03-06',
  url: 'https://owl.example.org/e/7gT4kPq2Wx9Z',
};
const now = new Date(Date.UTC(2027, 1, 1, 9, 15, 30, 123));
const octets = (line: string): number => new TextEncoder().encode(line).length;

describe('buildIcs', () => {
  it('writes an all-day event with an exclusive end', () => {
    const ics = buildIcs(entry, now);
    expect(ics).toContain('DTSTART;VALUE=DATE:20270306\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20270307\r\n');
    expect(ics).toContain('DTSTAMP:20270201T091530Z\r\n');
    expect(ics).toContain('UID:7gT4kPq2Wx9Z@owl.example.org\r\n');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it('ends a block of days on the day after its last', () => {
    expect(buildIcs({ ...entry, end: '2027-03-07' }, now)).toContain(
      'DTEND;VALUE=DATE:20270308\r\n'
    );
  });

  it('crosses the turn of the year', () => {
    const ics = buildIcs(
      { ...entry, start: '2027-12-31', end: '2027-12-31' },
      now
    );
    expect(ics).toContain('DTEND;VALUE=DATE:20280101\r\n');
  });

  it('includes description, location and link only when there are some', () => {
    expect(buildIcs({ ...entry, url: null }, now)).not.toContain('URL:');
    const bare = buildIcs(entry, now);
    expect(bare).not.toContain('DESCRIPTION');
    expect(bare).not.toContain('LOCATION');
    const full = buildIcs(
      { ...entry, description: 'Bring a ball', location: 'North field' },
      now
    );
    expect(full).toContain('DESCRIPTION:Bring a ball\r\n');
    expect(full).toContain('LOCATION:North field\r\n');
  });

  it('keeps every line within 75 octets', () => {
    const ics = buildIcs(
      { ...entry, title: '⚽ '.repeat(60), description: 'ä'.repeat(200) },
      now
    );
    for (const line of ics.split('\r\n'))
      expect(octets(line)).toBeLessThanOrEqual(75);
  });
});

describe('escapeIcsText', () => {
  it('escapes backslashes first, then separators and line breaks', () => {
    expect(escapeIcsText('a\\b;c,d\ne\r\nf\rg')).toBe(
      'a\\\\b\\;c\\,d\\ne\\nf\\ng'
    );
  });

  it('leaves plain text alone', () => {
    expect(escapeIcsText('Summer tournament')).toBe('Summer tournament');
    expect(escapeIcsText('')).toBe('');
  });
});

describe('foldIcsLine', () => {
  it('leaves a short line alone', () => {
    expect(foldIcsLine('SUMMARY:Hi')).toBe('SUMMARY:Hi');
  });

  it('folds at exactly 75 octets, continuing after a space', () => {
    const folded = foldIcsLine('x'.repeat(160));
    const lines = folded.split('\r\n');
    expect(lines.map(octets)).toEqual([75, 75, 12]);
    expect(lines.slice(1).every((line) => line.startsWith(' '))).toBe(true);
    expect(
      lines.map((line, i) => (i === 0 ? line : line.slice(1))).join('')
    ).toBe('x'.repeat(160));
  });

  it('never cuts a character in half', () => {
    // 74 ASCII octets, then a four-octet emoji: it moves to the next line whole.
    const folded = foldIcsLine(`${'x'.repeat(74)}🦉tail`);
    const [first, second] = folded.split('\r\n');
    expect(first).toBe('x'.repeat(74));
    expect(second).toBe(' 🦉tail');
  });
});

describe('buildIcs with control characters in uid or url', () => {
  const properties = (ics: string) =>
    ics
      .split('\r\n')
      .filter(Boolean)
      .map((line) => line.split(/[:;]/)[0]);

  it('refuses a line break, a bare CR or LF and other controls', () => {
    for (const bad of [
      '\r\nATTENDEE:x',
      'a\nb',
      'a\rb',
      'a\u0000b',
      'a\u007Fb',
    ]) {
      expect(() => buildIcs({ ...entry, uid: bad }, now)).toThrow(RangeError);
      expect(() => buildIcs({ ...entry, url: bad }, now)).toThrow(RangeError);
    }
  });

  it('writes a normal uid and url unchanged, and no url line without one', () => {
    const ics = buildIcs(entry, now);
    expect(ics).toContain(`UID:${entry.uid}\r\n`);
    expect(ics).toContain(`URL:${entry.url}\r\n`);
    expect(properties(ics)).not.toContain('ATTENDEE');
    expect(buildIcs({ ...entry, url: null }, now)).not.toContain('URL:');
    expect(buildIcs({ ...entry, url: '' }, now)).not.toContain('URL:');
  });
});

describe('googleCalendarUrl', () => {
  it('fills in the event with an exclusive end', () => {
    const url = new URL(
      googleCalendarUrl({
        ...entry,
        end: '2027-03-07',
        description: 'Bring a ball',
        location: 'North field',
      })
    );
    expect(url.origin).toBe('https://calendar.google.com');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Summer tournament');
    expect(url.searchParams.get('dates')).toBe('20270306/20270308');
    expect(url.searchParams.get('details')).toBe(
      `Bring a ball\n\n${entry.url}`
    );
    expect(url.searchParams.get('location')).toBe('North field');
  });

  it('keeps markup in the description from reaching Google as markup', () => {
    const details = (description: string | null, link: string | null = null) =>
      new URL(
        googleCalendarUrl({ ...entry, description, url: link })
      ).searchParams.get('details');
    const hostile = '<a href="https://evil.example/login">Re-confirm</a>';
    const text = details(hostile, entry.url)!;
    expect(text).not.toMatch(/[<>]/);
    expect(text).toContain('Re-confirm');
    expect(text.endsWith(`\n\n${entry.url}`)).toBe(true);
    // Nothing else is touched: ampersands, hashes and line breaks round-trip.
    expect(details('Tom & Jerry #1\nline two')).toBe(
      'Tom & Jerry #1\nline two'
    );
    // Only a link, only a description, neither.
    expect(details(null, entry.url)).toBe(entry.url);
    expect(details('<b>x</b>')).toBe('\u2039b\u203Ax\u2039/b\u203A');
    expect(details('')).toBeNull();
    expect(details(null)).toBeNull();
  });

  it('leaves out what is not there', () => {
    const url = new URL(googleCalendarUrl({ ...entry, url: null }));
    expect(url.searchParams.has('details')).toBe(false);
    expect(url.searchParams.has('location')).toBe(false);
  });
});
