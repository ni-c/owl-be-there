import { LANGUAGES } from '@owl/shared';
import { dictionaries } from '../src/i18n/dictionaries.ts';

/** Every language at once, for tests that translate synchronously. */
export async function preloadAllDictionaries(): Promise<void> {
  await Promise.all(LANGUAGES.map((language) => dictionaries.load(language)));
}
