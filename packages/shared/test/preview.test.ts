import { describe, expect, it } from 'vitest';
import {
  addDays,
  arabicPunctuation,
  monthRange,
  PREVIEW_MAX_WEEKS,
  previewCalendar,
  previewNeedsCjk,
  previewStatus,
  previewSvg,
  LANGUAGES,
  LOCALES,
  SERVER_TEXTS,
  textWidth,
  wrapText,
  type EventSnapshotData,
  weekdayOf,
  type Language,
} from '../src/index.js';

type Person = {
  name: string;
  yes?: string[];
  maybe?: string[];
  unseen?: string[];
};

function snapshot(
  options: {
    title?: string;
    language?: Language;
    days?: string[];
    people?: Person[];
    final?: [string, string];
    closed?: boolean;
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
      status: options.final ? 'finalized' : options.closed ? 'closed' : 'open',
      finalStart: options.final?.[0] ?? null,
      finalEnd: options.final?.[1] ?? null,
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
      unseen: person.unseen ?? [],
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

  it('leaves a day nobody has seen yet at no heat, even when it is in yes', () => {
    const weeks = previewWeeks(
      snapshot({
        people: [{ name: 'Anna', yes: ['2026-11-06'], unseen: ['2026-11-06'] }],
      })
    );
    const cells = new Map(weeks[0]!.map((c) => [c.day, c.level]));
    expect(cells.get('2026-11-06')).toBe(0);
  });

  it('draws a day only some have seen no warmer than one more can make', () => {
    // All three can on Friday; Saturday was added later and only Anna has
    // seen it: one of three, not one of one.
    const weeks = previewWeeks(
      snapshot({
        people: [
          { name: 'Anna', yes: ['2026-11-06', '2026-11-07'] },
          { name: 'Ben', yes: ['2026-11-06'], unseen: ['2026-11-07'] },
          { name: 'Cem', yes: ['2026-11-06'], unseen: ['2026-11-07'] },
        ],
      })
    );
    const cells = new Map(weeks[0]!.map((c) => [c.day, c.level]));
    expect(cells.get('2026-11-06')).toBe(5);
    expect(cells.get('2026-11-07')).toBe(2);
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

  it('keeps titles heavy in wide letters inside the column', () => {
    for (const title of [
      'Wimmelbuchwanderung Mummenschanz',
      'Mammutwanderung Wümme Wasserwerk',
      'W'.repeat(30),
      'm'.repeat(30),
      'a ' + 'A'.repeat(13) + '忘',
      'Мышиная ловля: ужин',
      'ТУРНИР ПО ФУТБОЛУ',
      'Щука, жук и шершень Юли и Жени',
    ]) {
      for (const line of wrapText(title, 590, 60, 10)) {
        expect(textWidth(line, 60), line).toBeLessThanOrEqual(590);
      }
    }
  });

  it('counts the wide letters wider than the rest', () => {
    expect(textWidth('W', 1)).toBeGreaterThan(textWidth('A', 1));
    expect(textWidth('M', 1)).toBeGreaterThan(textWidth('A', 1));
    expect(textWidth('m', 1)).toBeGreaterThan(textWidth('n', 1) * 1.3);
    expect(textWidth('w', 1)).toBeGreaterThan(textWidth('n', 1) * 1.3);
    expect(textWidth('n', 1)).toBe(textWidth('e', 1));
  });

  it('measures a word again after carrying it to the next line', () => {
    // The carried word plus the character that broke the line may itself be too
    // long, and has to be broken again.
    for (const text of [
      'ab ' + 'W'.repeat(9),
      'a ' + 'm'.repeat(20) + ' b',
      'x ' + 'MW'.repeat(12),
    ]) {
      const lines = wrapText(text, 300, 30, 20);
      expect(lines.join('').replaceAll(' ', '')).toBe(text.replaceAll(' ', ''));
      for (const line of lines)
        expect(textWidth(line, 30)).toBeLessThanOrEqual(300);
    }
  });

  it('collapses white space and gives nothing for an empty text', () => {
    expect(wrapText('  a \n\t b  ', 500, 30, 2)).toEqual(['a b']);
    expect(wrapText('', 500, 30, 2)).toEqual([]);
    expect(wrapText('   ', 500, 30, 2)).toEqual([]);
  });
});

describe('wrapText with Cyrillic', () => {
  it('measures the wide Cyrillic letters wider than the narrow ones, and than Latin', () => {
    // Measured from the picture as drawn: capitals 0.76 em, ЖШЩЮ about 1 em,
    // lowercase 0.56 em, жфшщыю about 0.8 em.
    expect(textWidth('Д', 1)).toBe(0.76);
    expect(textWidth('Ё', 1)).toBe(0.76);
    for (const letter of 'ЖШЩЮ') expect(textWidth(letter, 1), letter).toBe(1);
    expect(textWidth('д', 1)).toBe(0.56);
    expect(textWidth('ё', 1)).toBe(0.56);
    for (const letter of 'жфшщыю')
      expect(textWidth(letter, 1), letter).toBe(0.8);
    // Extended Cyrillic, too.
    expect(textWidth('Ѡ', 1)).toBe(0.76);
    expect(textWidth('ѣ', 1)).toBe(0.56);
    expect(textWidth('Ж', 1)).toBeGreaterThan(textWidth('Д', 1));
    expect(textWidth('Д', 1)).toBeGreaterThan(textWidth('A', 1));
    expect(textWidth('д', 1)).toBeGreaterThan(textWidth('n', 1));
  });

  it('leaves the Latin widths as they were', () => {
    const widths: [string, number][] = [
      [' ', 0.26],
      ['W', 1.1],
      ['M', 0.95],
      ['m', 0.9],
      ['w', 0.8],
      ['A', 0.68],
      ['Ü', 0.68],
      ['7', 0.68],
      ['n', 0.54],
      ['ö', 0.54],
      ['…', 0.54],
      ['忘', 1],
    ];
    for (const [char, width] of widths)
      expect(textWidth(char, 1), char).toBe(width);
  });

  it('wraps a Cyrillic title where it fills the column, not later', () => {
    expect(wrapText('Мышиная ловля: ужин', 590, 60, 3)).toEqual([
      'Мышиная ловля:',
      'ужин',
    ]);
    expect(wrapText('Ужин у Жени и Миши', 590, 60, 3)).toEqual([
      'Ужин у Жени и',
      'Миши',
    ]);
    expect(
      wrapText('ДЕНЬ РОЖДЕНИЯ ОЛЬГИ', 590, 60, 3).length
    ).toBeGreaterThanOrEqual(2);
    expect(wrapText('ТУРНИР ПО ФУТБОЛУ', 590, 60, 3)).toHaveLength(2);
  });

  it('keeps every line of a Cyrillic or mixed title inside the column', () => {
    for (const title of [
      'День рождения Ольги',
      'Щука, жук и шершень',
      'Party Вечеринка у Юли и Жени и всех их друзей',
      'Мышиная ловля: ужин и ещё много слов в заголовке который не помещается',
    ])
      for (const line of wrapText(title, 590, 60, 10))
        expect(textWidth(line, 60), line).toBeLessThanOrEqual(590);
  });

  it('mixes Latin and Cyrillic words on one line', () => {
    expect(wrapText('Party Вечеринка у Юли', 590, 60, 3)).toEqual([
      'Party Вечеринка у',
      'Юли',
    ]);
    expect(wrapText('Party', 590, 60, 3)).toEqual(['Party']);
  });

  it('wraps nothing for an empty text and one line for a single wide letter', () => {
    expect(wrapText('', 590, 60, 3)).toEqual([]);
    expect(wrapText('Ж', 590, 60, 3)).toEqual(['Ж']);
    // Wider than the line itself: it is still drawn, not dropped or looped on.
    expect(wrapText('Ж', 40, 60, 3)).toEqual(['Ж']);
    expect(wrapText('ЖЖ', 40, 60, 3)).toEqual(['Ж', 'Ж']);
  });

  it('cuts the third line with an ellipsis that fits', () => {
    const lines = wrapText(
      'Мышиная ловля: ужин и ещё много слов в заголовке который не помещается в три строки совсем',
      590,
      60,
      3
    );
    expect(lines).toEqual([
      'Мышиная ловля:',
      'ужин и ещё много',
      'слов в заголовке…',
    ]);
    expect(textWidth(lines[2]!, 60)).toBeLessThanOrEqual(590);
    // A last line as full as the others gives up letters for the ellipsis.
    const tight = wrapText(
      'Ужин у Жени и Миши и Юры и Жоры и Юли и Шуры',
      590,
      60,
      2
    );
    expect(tight).toHaveLength(2);
    expect(tight[1]!.endsWith('…')).toBe(true);
    expect(textWidth(tight[1]!, 60)).toBeLessThanOrEqual(590);
  });
});

describe('wrapText around Japanese dates', () => {
  const range = '日程決定：2027/02/26(金)～2027/02/28(日)';

  it('keeps each date of a range whole: the second moves down', () => {
    expect(wrapText(range, 590, 30, 3)).toEqual([
      '日程決定：2027/02/26(金)～',
      '2027/02/28(日)',
    ]);
    // Across the year as well.
    expect(
      wrapText('日程決定：2027/12/30(木)～2028/01/02(日)', 590, 30, 3)
    ).toEqual(['日程決定：2027/12/30(木)～', '2028/01/02(日)']);
  });

  it('is what the picture of a Japanese event shows', () => {
    for (const [start, end, first, second] of [
      ['2027-02-26', '2027-02-28', '2027/02/26(金)～', '2027/02/28(日)'],
      ['2027-12-30', '2028-01-02', '2027/12/30(木)～', '2028/01/02(日)'],
    ] as const) {
      const data = snapshot({ language: 'ja', final: [start, end] });
      const status = previewStatus(SERVER_TEXTS.ja, data, LOCALES.ja);
      expect(status).toBe(`日程決定：${first}${second}`);
      const svg = previewSvg(data, options);
      expect(svg).toContain(`>日程決定：${first}</text>`);
      expect(svg).toContain(`>${second}</text>`);
    }
  });

  it('leaves a single day and a short range on one line', () => {
    expect(wrapText('日程決定：2027/02/26(金)', 590, 30, 3)).toEqual([
      '日程決定：2027/02/26(金)',
    ]);
    expect(wrapText('2027/02/26(金)～2027/02/28(日)', 590, 30, 3)).toEqual([
      '2027/02/26(金)～2027/02/28(日)',
    ]);
  });

  it('keeps a date and its weekday together when the line ends at the weekday', () => {
    // The line is full just before 金: the whole date moves, not "26(" alone.
    expect(wrapText('日程決定：2027/02/26(金)', 375, 30, 3)).toEqual([
      '日程決定：',
      '2027/02/26(金)',
    ]);
    // A run of Latin letters before a full-width character, too.
    expect(wrapText('忘年会忘年会AB忘年会', 240, 30, 5)).toEqual([
      '忘年会忘年会',
      'AB忘年会',
    ]);
  });

  it('still cuts a long Latin word, and a run longer than the line', () => {
    const word = wrapText('A'.repeat(40), 300, 30, 5);
    expect(word.join('')).toBe('A'.repeat(40));
    expect(word.length).toBeGreaterThan(1);
    // The run moves to its own line, then breaks there: nothing is lost.
    const lines = wrapText('日本' + 'A'.repeat(40), 300, 30, 5);
    expect(lines[0]).toBe('日本');
    expect(lines.slice(1).join('')).toBe('A'.repeat(40));
    for (const line of lines)
      expect(textWidth(line, 30)).toBeLessThanOrEqual(300);
    expect(wrapText('日程決定：' + 'A'.repeat(30), 590, 30, 3)).toEqual([
      '日程決定：',
      'A'.repeat(28),
      'AA',
    ]);
  });

  it('breaks a run that starts the text at the overflow, with nothing before it', () => {
    const lines = wrapText('2027/02/26(金)～2027/02/28(日)', 200, 30, 5);
    expect(lines).toEqual(['2027/02/26', '(金)～', '2027/02/28', '(日)']);
    expect(lines.join('')).toBe('2027/02/26(金)～2027/02/28(日)');
  });

  it('keeps the word and character cases it had', () => {
    // A space on the line still decides, as before.
    expect(wrapText('a ' + 'A'.repeat(13) + '忘', 590, 60, 5)).toEqual([
      'a',
      'A'.repeat(13),
      '忘',
    ]);
    const japanese = wrapText('忘年会'.repeat(10), 300, 30, 5);
    expect(japanese.join('')).toBe('忘年会'.repeat(10));
    expect(japanese).toHaveLength(3);
    expect(wrapText('', 590, 30, 3)).toEqual([]);
  });

  it('cuts the last line with an ellipsis without tearing the date', () => {
    expect(wrapText(range, 590, 30, 1)).toEqual([
      '日程決定：2027/02/26(金)～…',
    ]);
    expect(wrapText(range, 590, 30, 2)).toEqual([
      '日程決定：2027/02/26(金)～',
      '2027/02/28(日)',
    ]);
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

describe('arabicPunctuation', () => {
  it('swaps dashes and middle dots in lines with Arabic letters only', () => {
    expect(arabicPunctuation('')).toBe('');
    expect(arabicPunctuation('October – November · 5')).toBe(
      'October – November · 5'
    );
    expect(arabicPunctuation('Шашлики — 5 · 2')).toBe('Шашлики — 5 · 2');
    expect(arabicPunctuation('أكتوبر – نوفمبر 2026')).toBe(
      'أكتوبر - نوفمبر 2026'
    );
    expect(arabicPunctuation('أكتوبر—نوفمبر')).toBe('أكتوبر-نوفمبر');
    expect(arabicPunctuation('حدّد الأيام · 5 إجابات')).toBe(
      'حدّد الأيام، 5 إجابات'
    );
    expect(arabicPunctuation('أ·ب · ج')).toBe('أ،ب، ج');
    expect(arabicPunctuation('عشاء الفريق')).toBe('عشاء الفريق');
  });
});

describe('previewSvg', () => {
  it('mirrors the Arabic preview without exposing private details', () => {
    const svg = previewSvg(
      snapshot({
        language: 'ar',
        title: 'عشاء الفريق',
        description: 'Do not show this',
        people: [{ name: 'Secret person' }],
      }),
      options
    );
    expect(svg).toContain('<rect x="48" y="48" width="456"');
    expect(svg).toContain('direction="rtl" text-anchor="end"');
    expect(visible(svg)).toContain('عشاء الفريق');
    expect(visible(svg)).toContain('حدّد الأيام التي تناسبك');
    expect(svg).not.toContain('Secret person');
    expect(svg).not.toContain('Do not show this');
  });

  it('puts a truncation mark outside Arabic text so the font still draws the letters', () => {
    const svg = previewSvg(
      snapshot({
        language: 'ar',
        title: 'بطولة كرة القدم مع الأصدقاء في عطلة نهاية الأسبوع',
      }),
      options
    );
    expect(svg).toContain('font-family="Nunito"');
    expect(svg).toContain('>…</text>');
    expect(svg).not.toMatch(/[\u0600-\u06ff]…<\/text>/u);
  });

  it('keeps dashes and middle dots out of Arabic lines, which the Arabic font cannot draw', () => {
    const svg = previewSvg(
      snapshot({
        language: 'ar',
        title: 'عشاء الفريق',
        days: ['2026-10-30', '2026-11-02'],
        people: [{ name: 'Anna', yes: ['2026-10-30'] }],
      }),
      options
    );
    const text = visible(svg);
    expect(text).toContain('تناسبك،');
    expect(text).toMatch(/أكتوبر - نوفمبر/u);
    expect(text).not.toMatch(/[–—·]/u);
  });

  it('mirrors the Persian and Urdu previews and keeps their lines drawable', () => {
    for (const language of ['fa', 'ur'] as const) {
      const svg = previewSvg(
        snapshot({
          language,
          title: 'شام',
          days: ['2026-10-30', '2026-11-02'],
          people: [{ name: 'Anna', yes: ['2026-10-30'] }],
        }),
        options
      );
      expect(svg, language).toContain('<rect x="48" y="48" width="456"');
      expect(svg, language).toContain('direction="rtl" text-anchor="end"');
      expect(svg, language).toContain(
        `font-family="'Noto Sans Arabic', Nunito"`
      );
      expect(visible(svg), language).not.toMatch(/[–—·]/u);
    }
    // Gregorian months with Persian digits.
    expect(
      visible(
        previewSvg(
          snapshot({ language: 'fa', days: ['2026-10-30', '2026-11-02'] }),
          options
        )
      )
    ).toContain('اکتبر تا نوامبر ۲۰۲۶');
  });

  it('draws Persian day numbers and Urdu weekday names, not Latin stand-ins', () => {
    const days = ['2026-10-30', '2026-11-02'];
    const persian = visible(
      previewSvg(snapshot({ language: 'fa', days }), options)
    );
    expect(persian).toContain('۳۰');
    expect(persian).toContain('۲');
    expect(persian).not.toMatch(/\b\d{1,2}\b/);
    const urdu = previewSvg(snapshot({ language: 'ur', days }), options);
    expect(visible(urdu)).toContain('پیر');
    expect(visible(urdu)).not.toMatch(/(^| )[MTWFS]( |$)/);
    // The longest name fits a cell, so the headings shrink.
    expect(urdu).toMatch(/font-size="1\d" font-weight="800"[^>]*>جمعرات</u);
    // Single letters elsewhere keep the full size.
    expect(previewSvg(snapshot({ language: 'de', days }), options)).toMatch(
      /font-size="22" font-weight="800"[^>]*>M</
    );
  });

  it('names the Arabic font first on Arabic lines only', () => {
    const arabic = previewSvg(
      snapshot({ language: 'ar', title: 'عشاء الفريق' }),
      options
    );
    expect(arabic).toMatch(
      /font-weight="800" font-family="'Noto Sans Arabic', Nunito"[^>]*>عشاء الفريق</u
    );
    expect(arabic).toMatch(
      /font-weight="400" font-family="'Noto Sans Arabic', Nunito"[^>]*>حدّد/u
    );
    expect(arabic).not.toMatch(/Noto Sans Arabic', Nunito"[^>]*>Owl Be There</);
    expect(previewSvg(snapshot(), options)).not.toContain(
      `'Noto Sans Arabic', Nunito`
    );
  });

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

  it('counts one hidden day in the singular, in German too', () => {
    const days = daysFrom('2026-11-02', 43);
    const german = visible(
      previewSvg(snapshot({ language: 'de', days }), options)
    );
    expect(german).toContain('+ 1 weiterer Tag');
    expect(german).not.toContain('weitere Tag');
    const plural = visible(
      previewSvg(
        snapshot({ language: 'de', days: daysFrom('2026-11-02', 44) }),
        options
      )
    );
    expect(plural).toContain('+ 2 weitere Tage');
    expect(
      visible(previewSvg(snapshot({ language: 'de' }), options))
    ).not.toContain('weiter');
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
    expect(previewNeedsCjk(snapshot({ language: 'zh-Hant' }))).toBe(true);
    expect(previewNeedsCjk(snapshot({ language: 'zh-Hans' }))).toBe(true);
    expect(previewNeedsCjk(snapshot({ language: 'ko' }))).toBe(true);
    expect(previewNeedsCjk(snapshot({ language: 'vi' }))).toBe(false);
    expect(previewNeedsCjk(snapshot({ language: 'uk' }))).toBe(false);
    expect(previewNeedsCjk(snapshot({ language: 'fa' }))).toBe(false);
    expect(previewNeedsCjk(snapshot({ language: 'ur' }))).toBe(false);
    expect(previewNeedsCjk(snapshot({ title: '忘年会' }))).toBe(true);
  });

  it('keeps emoji and symbols on the Latin font', () => {
    for (const title of [
      '',
      '🎉',
      '👍',
      '☕',
      '🦉 Party',
      '\u2764\uFE0F',
      '€ 5',
    ]) {
      expect(previewNeedsCjk(snapshot({ title }))).toBe(false);
    }
  });

  it('asks for it at both ends of every range it covers', () => {
    const edge = (code: number) =>
      previewNeedsCjk(snapshot({ title: String.fromCodePoint(code) }));
    for (const code of [
      0x2e80, 0x3042, 0x9fff, 0xac00, 0xd7af, 0xf900, 0xfaff, 0xff21, 0xffef,
      0x20bb7, 0x3ffff,
    ]) {
      expect(edge(code)).toBe(true);
    }
    for (const code of [
      0x2e7f, 0xa000, 0xabff, 0xd7b0, 0xf8ff, 0xfb00, 0xfeff, 0xfff0, 0x1f389,
      0x1faff, 0x40000,
    ]) {
      expect(edge(code)).toBe(false);
    }
  });

  it('finds a CJK character among other text', () => {
    expect(previewNeedsCjk(snapshot({ title: 'Party 🎉 忘年会' }))).toBe(true);
    expect(previewNeedsCjk(snapshot({ title: '안녕' }))).toBe(true);
    expect(previewNeedsCjk(snapshot({ title: '𠮷' }))).toBe(true);
    expect(previewNeedsCjk(snapshot({ language: 'ja', title: 'Party' }))).toBe(
      true
    );
  });
});

describe('the state sentence of a poll', () => {
  const sentence = (data: EventSnapshotData): string =>
    previewStatus(
      SERVER_TEXTS[data.event.language],
      data,
      LOCALES[data.event.language]
    );

  it.each(LANGUAGES)(
    'says a poll without a date is closed, in %s, in the picture too',
    (language) => {
      const data = snapshot({ language, closed: true });
      const texts = SERVER_TEXTS[language];
      expect(sentence(data)).toBe(texts.previewClosed);
      const text = visible(previewSvg(data, options));
      expect(text).not.toContain(texts.previewOpen(0));
      expect(
        text
          .replace(/\s+/g, '')
          .includes(texts.previewClosed.replace(/\s+/g, ''))
      ).toBe(true);
    }
  );

  it('prefers the date over the closed state', () => {
    const data = snapshot({ final: ['2026-11-07', '2026-11-07'] });
    data.event.status = 'closed';
    expect(sentence(data)).toMatch(/^The date is set: /);
  });

  it('invites answers again once reopened, with none, one or several', () => {
    const open = snapshot();
    expect(sentence(open)).toBe(SERVER_TEXTS.en.previewOpen(0));
    expect(sentence(open)).toBe(
      'Add the days you can make it. No sign-up needed.'
    );
    expect(
      sentence(snapshot({ people: [{ name: 'A', yes: ['2026-11-06'] }] }))
    ).toContain('1 answer so far');
    expect(
      sentence(
        snapshot({
          people: [
            { name: 'A', yes: ['2026-11-06'] },
            { name: 'B', maybe: ['2026-11-07'] },
          ],
        })
      )
    ).toContain('2 answers so far');
  });

  it('does not count people who have not answered', () => {
    const data = snapshot({ people: [{ name: 'A' }] });
    expect(sentence(data)).toBe(SERVER_TEXTS.en.previewOpen(0));
  });
});
