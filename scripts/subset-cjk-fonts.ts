/**
 * Builds the interface subsets of the bundled Noto Sans CJK fonts from the
 * full ones:
 *
 *     PYFTSUBSET=/path/to/pyftsubset npm run fonts:subset
 *
 * `noto-sans-cjk-{jp,sc}-ui-v2.woff2` hold only the characters the Japanese
 * and the Simplified Chinese interface uses (its dictionary, the start page,
 * the server's texts, what `Intl` writes for days and months) plus ASCII and
 * the common CJK punctuation; the page loads them instead of the 11 MB
 * `-regular` files, which the browser takes only for a character the subset
 * lacks. The input is the full font next to it, so run this after a text
 * changed. `subset-cjk-fonts.test.ts` fails when a text uses a character a
 * subset does not have.
 *
 * Needs fontTools with Brotli (`pip install fonttools brotli`). When a subset
 * changes, give the font files a new version suffix (`-v3`) in this script, in
 * `styles.css` and in `server/src/preview.ts`: `/fonts/` is served immutable.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  LANGUAGE_NAMES,
  LOCALES,
  SERVER_TEXTS,
  TAGLINES,
  type Language,
} from '@owl/shared';
import { HOME_TEXTS } from '@owl/shared/home-texts';
import { dictionaries } from '../packages/client/src/i18n/dictionaries.ts';

export const FONT_DIR = resolve(
  import.meta.dirname,
  '../packages/client/public/fonts'
);

/** The version suffix of every bundled font file. */
export const FONT_VERSION = 'v2';

/** The subsets: the language they serve and the full font they come from. */
export const CJK_SUBSETS = [
  { language: 'ja', family: 'jp' },
  { language: 'zh-Hans', family: 'sc' },
] as const;

export const subsetFile = (family: string): string =>
  `noto-sans-cjk-${family}-ui-${FONT_VERSION}.woff2`;
export const fullFile = (family: string): string =>
  `noto-sans-cjk-${family}-regular-${FONT_VERSION}.woff2`;

/** CJK punctuation, full-width forms, arrows and symbols a text may use. */
const PUNCTUATION =
  '　、。〃々〆〇〈〉《》「」『』【】〒〓〔〕〖〗〜〝〞・ー～！＂＃＄％＆＇（）＊＋，－．／：；＜＝＞？＠［＼］＾＿｀｛｜｝～' +
  '“”‘’‹›«»…‥—–‐‑−×÷±°′″℃€¥£©®™§¶†‡•·※' +
  '←→↑↓↔⇒★☆♥♡♪✓✔✕✗';

/** Weekdays, months, years and numerals in Chinese and Japanese, whatever `Intl` gives. */
export const CALENDAR_CHARACTERS =
  '日月火水木金土年一二三四五六七八九十零百千周星期週曜午前后後时時分秒今明昨';

/** Characters `Intl` writes next to numbers: no-break and thin spaces. */
const SPACES = '   ';

/** Every printable character of a text: no controls, spaces or format marks. */
export function charactersOf(text: string): Set<number> {
  const found = new Set<number>();
  for (const char of text) {
    if (/[\p{Cc}\p{Cf}\p{Z}\p{Cs}\p{Co}\p{Cn}\p{Mn}\p{Me}]/u.test(char))
      continue;
    found.add(char.codePointAt(0)!);
  }
  return found;
}

/** Every string inside a value: object values, arrays, and what functions return for samples. */
function stringsOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') {
    for (const sample of [0, 1, 2, 3, 5, 11, 100, 'x'])
      try {
        stringsOf(value(sample), out);
      } catch {
        // A function that takes something else gives nothing.
      }
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) stringsOf(item, out);
  }
  return out;
}

/** What `Intl` writes for days, months and weekdays in the language's locale. */
export function intlText(language: Language): string {
  const locale = LOCALES[language];
  const out: string[] = [];
  const days = Array.from(
    { length: 366 },
    (_, i) => new Date(Date.UTC(2027, 0, 1 + i, 13, 5))
  );
  const sets: Intl.DateTimeFormatOptions[] = [];
  for (const weekday of ['long', 'short', 'narrow'] as const)
    sets.push({ weekday });
  for (const month of [
    'long',
    'short',
    'narrow',
    'numeric',
    '2-digit',
  ] as const)
    sets.push({ month }, { month, year: 'numeric' }, { month, day: 'numeric' });
  sets.push(
    { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' },
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
    { dateStyle: 'full' },
    { dateStyle: 'long' },
    { dateStyle: 'medium' },
    { dateStyle: 'short' },
    { hour: 'numeric', minute: 'numeric' },
    { hour: 'numeric', minute: 'numeric', hour12: true },
    { era: 'short', year: 'numeric' },
    { year: 'numeric' }
  );
  for (const timeZoneName of ['short', 'long'] as const)
    for (const timeZone of [
      'UTC',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Europe/Berlin',
    ])
      sets.push({ timeZoneName, timeZone, hour: 'numeric' });
  for (const options of sets) {
    const format = new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      ...options,
    });
    for (const day of days) out.push(format.format(day));
    out.push(format.formatRange(days[0]!, days[40]!));
  }
  for (const style of ['long', 'short', 'narrow'] as const)
    for (const type of ['conjunction', 'disjunction'] as const)
      out.push(
        new Intl.ListFormat(locale, { style, type }).format(['a', 'b', 'c'])
      );
  const digits = new Intl.NumberFormat(locale, { useGrouping: true });
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100, 1234567])
    out.push(digits.format(n));
  return out.join('\n');
}

/**
 * Every text the client shows in a language: its dictionary with the plural
 * forms, the start page, the tagline, the language picker, the server's texts
 * and the `Intl` output.
 */
export async function textsOf(language: Language): Promise<string> {
  const pack = await dictionaries.load(language);
  const out: string[] = [
    ...stringsOf(pack.texts),
    ...stringsOf(pack.forms ?? {}),
    ...stringsOf(HOME_TEXTS[language]),
    TAGLINES[language],
    ...stringsOf(LANGUAGE_NAMES),
    ...stringsOf(SERVER_TEXTS[language]),
    intlText(language),
  ];
  return out.join('\n');
}

/** The code points a subset has to hold for a language. */
export async function uiCharacters(language: Language): Promise<Set<number>> {
  // The Latin letters beyond ASCII come from Nunito and the language picker's
  // other scripts from the system: only Han, kana and shared marks belong here.
  const found = new Set(
    [
      ...charactersOf(
        `${await textsOf(language)}${PUNCTUATION}${SPACES}${CALENDAR_CHARACTERS}`
      ),
    ].filter((code) =>
      /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Common}]/u.test(
        String.fromCodePoint(code)
      )
    )
  );
  for (let code = 0x21; code <= 0x7e; code += 1) found.add(code);
  for (let digit = 0; digit < 10; digit += 1) found.add(0x30 + digit);
  return found;
}

async function main(): Promise<void> {
  const tool = process.env.PYFTSUBSET ?? 'pyftsubset';
  const work = mkdtempSync(join(tmpdir(), 'owl-subset-'));
  try {
    for (const { language, family } of CJK_SUBSETS) {
      const codes = [...(await uiCharacters(language))].sort((a, b) => a - b);
      const list = join(work, `${family}.txt`);
      writeFileSync(
        list,
        codes.map((code) => `U+${code.toString(16).toUpperCase()}`).join('\n')
      );
      execFileSync(
        tool,
        [
          join(FONT_DIR, fullFile(family)),
          `--unicodes-file=${list}`,
          `--output-file=${join(FONT_DIR, subsetFile(family))}`,
          '--flavor=woff2',
          '--layout-features=*',
          '--notdef-outline',
          '--name-IDs=*',
          '--desubroutinize',
        ],
        { stdio: 'inherit' }
      );
      console.log(`${subsetFile(family)}: ${codes.length} characters`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.main) await main();
