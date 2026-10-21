import { LANGUAGES, LOCALES } from '@owl/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { dictionaries } from '../src/i18n/dictionaries.ts';
import { en, type CountedKey } from '../src/i18n/en.ts';
import { preloadAllDictionaries } from './dictionaries.ts';

beforeAll(preloadAllDictionaries);

const COUNTED = Object.keys(en)
  .filter((key) => key.endsWith('_other'))
  .map((key) => key.slice(0, -'_other'.length) as CountedKey);

/** Counts the app can show: days (up to the horizon), people, answers. */
const COUNTS = Array.from({ length: 2000 }, (_, count) => count);

describe('plural forms', () => {
  it('lists the counted keys', () => {
    expect(COUNTED.length).toBeGreaterThan(5);
  });

  it.each(LANGUAGES)(
    '%s has a form for every category its counts reach',
    (language) => {
      const rules = new Intl.PluralRules(LOCALES[language]);
      const reached = new Set(COUNTS.map((count) => rules.select(count)));
      const { texts, forms } = dictionaries.peek(language)!;
      const missing: string[] = [];
      for (const category of reached) {
        for (const key of COUNTED) {
          const has =
            category === 'one' || category === 'other'
              ? texts[`${key}_${category}` as keyof typeof texts]
              : forms?.[category]?.[key];
          // Where whole numbers never reach `other` (Polish, Russian), the
          // `_other` text is the one for `many`.
          const standsIn =
            category === 'many' &&
            !reached.has('other') &&
            texts[`${key}_other`];
          if (!has && !standsIn) missing.push(`${category} ${key}`);
        }
      }
      expect(missing).toEqual([]);
    }
  );

  it('adds no form for a category the language does not use', () => {
    for (const language of LANGUAGES) {
      const categories = new Set(
        new Intl.PluralRules(LOCALES[language]).resolvedOptions()
          .pluralCategories
      );
      const forms = dictionaries.peek(language)!.forms ?? {};
      for (const category of Object.keys(forms))
        expect(categories.has(category as Intl.LDMLPluralRule), language).toBe(
          true
        );
    }
  });
});
