import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { Language } from '@owl/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { coverageOf } from '../packages/server/src/preview.js';
import {
  CALENDAR_CHARACTERS,
  CJK_SUBSETS,
  FONT_DIR,
  charactersOf,
  fullFile,
  subsetFile,
  textsOf,
  uiCharacters,
} from './subset-cjk-fonts.ts';

const wawoff2 = createRequire(import.meta.url)('wawoff2') as {
  decompress(data: Uint8Array): Promise<Uint8Array>;
};

async function coverOf(file: string) {
  const woff2 = await readFile(join(FONT_DIR, file));
  return coverageOf([(await wawoff2.decompress(woff2)).slice()]);
}

const show = (codes: number[]): string =>
  codes
    .map((code) => `${String.fromCodePoint(code)} U+${code.toString(16)}`)
    .join(', ');

describe('the CJK interface subsets', () => {
  beforeAll(async () => {
    // Warm the dictionaries once; the loop below reuses them.
    await Promise.all(CJK_SUBSETS.map(({ language }) => textsOf(language)));
  }, 30_000);

  for (const { language, family } of CJK_SUBSETS) {
    it(`cover every character the ${language} texts use`, async () => {
      const covers = await coverOf(subsetFile(family));
      const full = await coverOf(fullFile(family));
      // A symbol the full font lacks too (a check mark) falls back to the system.
      const missing = [...(await uiCharacters(language))].filter(
        (code) => full(code) && !covers(code)
      );
      // Run `npm run fonts:subset` (needs fontTools) and commit the files.
      expect(show(missing)).toBe('');
    });

    it(`hold the weekday and month characters of ${language}`, async () => {
      const covers = await coverOf(subsetFile(family));
      for (const char of CALENDAR_CHARACTERS)
        expect(covers(char.codePointAt(0)!), char).toBe(true);
    });

    it(`stay small next to the full ${language} font`, async () => {
      const [subset, full] = await Promise.all([
        readFile(join(FONT_DIR, subsetFile(family))),
        readFile(join(FONT_DIR, fullFile(family))),
      ]);
      expect(subset.length).toBeLessThan(400_000);
      expect(subset.length).toBeLessThan(full.length / 10);
    });
  }

  it('leave out a character no text uses', async () => {
    // A rare ideograph: if this is covered, the subset is the full font.
    const covers = await coverOf(subsetFile('jp'));
    expect(covers(0x9f98)).toBe(false);
  });

  it('count printable characters only', () => {
    expect([...charactersOf('a b\n⁨é⁩‍')]).toEqual([0x61, 0x62, 0xe9]);
    expect(charactersOf('').size).toBe(0);
  });
});

describe('the Arabic fonts', () => {
  const ARABIC: Language[] = ['ar', 'fa', 'ur'];
  for (const file of [
    'owl-noto-sans-arabic-regular-v2.woff2',
    'owl-noto-sans-arabic-bold-v2.woff2',
  ]) {
    for (const language of ARABIC) {
      it(`${file} covers every Arabic-script character of the ${language} texts`, async () => {
        const covers = await coverOf(file);
        const missing = [...charactersOf(await textsOf(language))].filter(
          (code) =>
            /\p{scx=Arabic}/u.test(String.fromCodePoint(code)) && !covers(code)
        );
        expect(show(missing)).toBe('');
      });
    }
  }
});
