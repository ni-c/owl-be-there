import { describe, expect, it } from 'vitest';
import {
  addDays,
  monthRange,
  PREVIEW_MAX_WEEKS,
  previewCalendar,
  previewNeedsCjk,
  previewSvg,
  textWidth,
  wrapText,
  type EventSnapshotData,
  weekdayOf,
  type Language,
} from '../src/index.js';

type Person = { name: string; yes?: string[]; maybe?: string[] };

function snapshot(
  options: {
    title?: string;
    language?: Language;
    days?: string[];
    people?: Person[];
    final?: [string, string];
    description?: string;
  } = {}
): EventSnapshotData {
  const days = options.days ?? ['2026-11-06', '2026-11-07', '2026-11-08'];
  return {
    event: {
      id: '7gT4kPq2Wx9Z',
      title: options.title ?? 'Summer tournament',
      description: options.description ?? null,
      location: null,
      emoji: 'soccer',
      creatorName: null,
      language: options.language ?? 'en',
      durationDays: 1,
      minCount: null,
      status: options.final ? 'finalized' : 'open',
      finalStart: options.final?.[0] ?? null,
      finalEnd: options.final?.[1] ?? null,
      createdAt: 0,
      expiresOn: '2027-03-01',
      version: 3,
      days,
    },
    participants: (options.people ?? []).map((person, index) => ({
      id: `p${index}aaaaaaaaaa`.slice(0, 12),
      name: person.name,
      note: null,
      source: 'self' as const,
      answered: Boolean(person.yes ?? person.maybe),
      hasPassword: false,
      rev: 1,
      yes: person.yes ?? [],
      maybe: person.maybe ?? [],
      unseen: [],
    })),
  };
}

const options = { host: 'owlbethere.app', owl: null };

/** The visible text of the picture, its lines joined by spaces. */
const visible = (svg: string): string =>
  [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
    .map((match) => match[1])
    .join(' ');

/** ICU puts thin spaces around the dash of a range. */
const plain = (text: string): string => text.replace(/\s/g, ' ');

const previewWeeks = (data: EventSnapshotData) => previewCalendar(data).weeks;

/** Every day from `start`, `count` of them. */
const daysFrom = (start: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => {
    return addDays(start, i);
  });

describe('previewCalendar', () => {
  it('colours candidate days by heat and leaves the others blank', () => {
    const weeks = previewWeeks(
      snapshot({
        people: [
          { name: 'Anna', yes: ['2026-11-06', '2026-11-07'] },
          { name: 'Ben', yes: ['2026-11-06'], maybe: ['2026-11-07'] },
        ],
      })
    );
    expect(weeks).toHaveLength(1);
    const cells = new Map(weeks[0]!.map((c) => [c.day, c.level]));
    expect(cells.get('2026-11-06')).toBe(5); // both can
    expect(cells.get('2026-11-07')).toBe(4); // one yes, one maybe: 0.75
    expect(cells.get('2026-11-08')).toBe(0); // nobody
    expect(cells.get('2026-11-02')).toBeNull(); // Monday, not a candidate
  });

  it('starts the week on Monday, and on Sunday in Japanese', () => {
    expect(previewWeeks(snapshot())[0]![0]!.day).toBe('2026-11-02');
    expect(previewWeeks(snapshot({ language: 'ja' }))[0]![0]!.day).toBe(
      '2026-11-01'
    );
  });

  it('marks every day of the chosen block, and only those', () => {
    const cells = previewWeeks(
      snapshot({ final: ['2026-11-07', '2026-11-08'] })
    ).flat();
    expect(cells.filter((c) => c.chosen).map((c) => c.day)).toEqual([
      '2026-11-07',
      '2026-11-08',
    ]);
  });

  it('shows a poll of up to six weeks whole', () => {
    const calendar = previewCalendar(
      snapshot({ days: daysFrom('2026-11-02', 42) })
    );
    expect(calendar.weeks).toHaveLength(PREVIEW_MAX_WEEKS);
    expect(calendar.hidden).toBe(0);
    expect(calendar.first).toBe('2026-11-02');
    expect(calendar.last).toBe('2026-12-13');
  });

  it('shows the first weeks of a long poll nobody has answered', () => {
    const calendar = previewCalendar(
      snapshot({ days: daysFrom('2026-11-02', 91) })
    );
    expect(calendar.weeks).toHaveLength(PREVIEW_MAX_WEEKS);
    expect(calendar.weeks[0]![0]!.day).toBe('2026-11-02');
    expect(calendar.hidden).toBe(91 - 42);
    expect(calendar.last).toBe('2027-01-31');
  });

  it('shows the weeks around the best day of a long poll', () => {
    // Week 9 of 13 is the one everybody can make.
    const calendar = previewCalendar(
      snapshot({
        days: daysFrom('2026-11-02', 91),
        people: [
          { name: 'A', yes: ['2026-12-31'] },
          { name: 'B', yes: ['2026-12-31', '2026-11-03'] },
        ],
      })
    );
    const rows = calendar.weeks.map((row) => row[0]!.day);
    expect(rows[2]).toBe('2026-12-28'); // the best week third from the top
    expect(rows).toHaveLength(PREVIEW_MAX_WEEKS);
    const best = calendar.weeks.flat().find((c) => c.day === '2026-12-31')!;
    expect(best.level).toBe(5);
  });

  it('keeps six weeks when the best day is near either end', () => {
    const days = daysFrom('2026-11-02', 91);
    const at = (day: string) =>
      previewCalendar(
        snapshot({ days, people: [{ name: 'A', yes: [day] }] })
      ).weeks.map((row) => row[0]!.day);
    expect(at('2026-11-02')[0]).toBe('2026-11-02');
    const end = at('2027-01-31');
    expect(end).toHaveLength(PREVIEW_MAX_WEEKS);
    expect(end[PREVIEW_MAX_WEEKS - 1]).toBe('2027-01-25');
  });

  it('centres a long poll on the chosen date once there is one', () => {
    const rows = previewCalendar(
      snapshot({
        days: daysFrom('2026-11-02', 91),
        people: [{ name: 'A', yes: ['2026-11-03'] }],
        final: ['2026-12-17', '2026-12-18'],
      })
    ).weeks.map((row) => row[0]!.day);
    expect(rows[2]).toBe('2026-12-14');
  });

  it('skips weeks without a candidate day when counting', () => {
    // Weekends over three months: thirteen rows, six shown.
    const days = daysFrom('2026-11-02', 91).filter(
      (day) => weekdayOf(day) >= 5
    );
    const calendar = previewCalendar(snapshot({ days }));
    expect(calendar.weeks).toHaveLength(PREVIEW_MAX_WEEKS);
    expect(calendar.hidden).toBe(days.length - 12);
  });

  it('counts people who never answered as neither yes nor no', () => {
    const weeks = previewWeeks(snapshot({ people: [{ name: 'Anna' }] }));
    expect(weeks.flat().every((c) => c.level === null || c.level === 0)).toBe(
      true
    );
  });
});

describe('wrapText', () => {
  it('keeps a short text on one line', () => {
    expect(wrapText('Pub quiz', 500, 60, 3)).toEqual(['Pub quiz']);
  });

  it('breaks between words and cuts the last line with an ellipsis', () => {
    const lines = wrapText(
      'Team dinner before the holidays with everyone from the office and friends',
      590,
      60,
      3
    );
    expect(lines).toHaveLength(3);
    expect(lines[2]!.endsWith('…')).toBe(true);
    for (const line of lines) {
      expect(line).toBe(line.trim());
      expect(textWidth(line, 60)).toBeLessThanOrEqual(590);
    }
  });

  it('breaks a word longer than a line, and text without spaces', () => {
    const word = wrapText('A'.repeat(40), 300, 30, 5);
    expect(word.length).toBeGreaterThan(1);
    expect(word.join('')).toBe('A'.repeat(40));
    const japanese = wrapText('忘年会'.repeat(10), 300, 30, 5);
    expect(japanese.length).toBeGreaterThan(1);
    for (const line of japanese)
      expect(textWidth(line, 30)).toBeLessThanOrEqual(300);
  });

  it('shortens a full last line to make room for the ellipsis', () => {
    const lines = wrapText('A'.repeat(100), 300, 30, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith('…')).toBe(true);
    // Without the cut, the ellipsis would stick out of the line.
    expect(lines[1]!.length - 1).toBeLessThan(lines[0]!.length);
    expect(textWidth(lines[1]!, 30)).toBeLessThanOrEqual(300);
  });

  it('collapses white space and gives nothing for an empty text', () => {
    expect(wrapText('  a \n\t b  ', 500, 30, 2)).toEqual(['a b']);
    expect(wrapText('', 500, 30, 2)).toEqual([]);
    expect(wrapText('   ', 500, 30, 2)).toEqual([]);
  });
});

describe('monthRange', () => {
  it('names one month, or the range across months and years', () => {
    expect(monthRange('2026-10-15', '2026-10-20', 'en-GB')).toBe(
      'October 2026'
    );
    expect(plain(monthRange('2026-10-15', '2026-11-03', 'en-GB'))).toBe(
      'October – November 2026'
    );
    expect(plain(monthRange('2026-12-15', '2027-01-03', 'de-DE'))).toBe(
      'Dezember 2026 – Januar 2027'
    );
  });

  it('writes the Japanese range the way people write it', () => {
    expect(monthRange('2026-10-15', '2026-10-20', 'ja-JP')).toBe('2026年10月');
    expect(monthRange('2026-10-15', '2026-11-03', 'ja-JP')).toBe(
      '2026年10月～11月'
    );
    expect(monthRange('2026-12-15', '2027-01-03', 'ja-JP')).toBe(
      '2026年12月～2027年1月'
    );
  });
});

describe('previewSvg', () => {
  it('shows the title and the state, never names or the description', () => {
    const svg = previewSvg(
      snapshot({
        description: 'Visit https://phish.example',
        people: [{ name: 'Zebulon', yes: ['2026-11-06'] }],
      }),
      options
    );
    const text = visible(svg);
    expect(text).toContain('Summer tournament');
    expect(text).toContain('Add the days you can make it · 1 answer so far');
    expect(text).toContain('owlbethere.app');
    expect(text).toContain('November 2026');
    expect(svg).not.toContain('Zebulon');
    expect(svg).not.toContain('phish');
  });

  it('escapes the title', () => {
    const svg = previewSvg(
      snapshot({ title: '</text><script>alert(1)</script> & co' }),
      options
    );
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;/text&gt;&lt;script&gt;');
    expect(visible(svg)).toContain('&amp; co');
  });

  it('announces a chosen date in the event language', () => {
    const svg = previewSvg(
      snapshot({ language: 'de', final: ['2026-11-07', '2026-11-07'] }),
      options
    );
    expect(svg).toMatch(/Der Termin steht: Sa\., 7\. Nov/);
    expect(svg).toContain('stroke="#b5541c"');
  });

  it('leaves the owl out when there is none, and draws it when there is', () => {
    expect(previewSvg(snapshot(), options)).not.toContain('<image');
    expect(
      previewSvg(snapshot(), {
        ...options,
        owl: 'data:image/svg+xml;base64,AA',
      })
    ).toContain('<image href="data:image/svg+xml;base64,AA"');
  });

  it('draws an event with no answers yet', () => {
    const svg = previewSvg(snapshot(), options);
    expect(visible(svg)).toContain(
      'Add the days you can make it. No sign-up needed.'
    );
    expect(svg.match(/<rect /g)!.length).toBe(2 + 3); // ground, panel, 3 days
  });
});

describe('previewSvg of a long poll', () => {
  it('names the whole period and counts the days left out', () => {
    const svg = previewSvg(
      snapshot({ language: 'de', days: daysFrom('2026-11-02', 91) }),
      options
    );
    const text = plain(visible(svg));
    expect(text).toContain('November 2026 – Januar 2027');
    expect(text).toContain('+ 49 weitere Tage');
  });

  it('says nothing about more days when the poll fits', () => {
    expect(visible(previewSvg(snapshot(), options))).not.toContain('more');
  });

  it('counts one hidden day in the singular', () => {
    const svg = previewSvg(
      snapshot({ days: daysFrom('2026-11-02', 43) }),
      options
    );
    expect(visible(svg)).toContain('+ 1 more day');
  });
});

describe('previewNeedsCjk', () => {
  it('asks for the Japanese font for Japanese events and titles', () => {
    expect(previewNeedsCjk(snapshot())).toBe(false);
    expect(previewNeedsCjk(snapshot({ title: 'Grillabend Ü' }))).toBe(false);
    expect(previewNeedsCjk(snapshot({ language: 'ja' }))).toBe(true);
    expect(previewNeedsCjk(snapshot({ title: '忘年会' }))).toBe(true);
  });
});
