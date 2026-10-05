import { describe, expect, it } from 'vitest';
import {
  monthRange,
  PREVIEW_MAX_WEEKS,
  previewNeedsCjk,
  previewSvg,
  previewWeeks,
  textWidth,
  wrapText,
  type EventSnapshotData,
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

describe('previewWeeks', () => {
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

  it('shows at most the first weeks of a long poll', () => {
    const days = Array.from({ length: 70 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 10, 1 + i));
      return date.toISOString().slice(0, 10);
    });
    const weeks = previewWeeks(snapshot({ days }));
    expect(weeks).toHaveLength(PREVIEW_MAX_WEEKS);
    expect(weeks[0]![6]!.day).toBe('2026-11-01');
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

describe('previewNeedsCjk', () => {
  it('asks for the Japanese font for Japanese events and titles', () => {
    expect(previewNeedsCjk(snapshot())).toBe(false);
    expect(previewNeedsCjk(snapshot({ title: 'Grillabend Ü' }))).toBe(false);
    expect(previewNeedsCjk(snapshot({ language: 'ja' }))).toBe(true);
    expect(previewNeedsCjk(snapshot({ title: '忘年会' }))).toBe(true);
  });
});
