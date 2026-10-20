import { LANGUAGES, type Language } from '@owl/shared';
import { createLazyCache } from '../lib/lazyCache.ts';
import { de } from './de.ts';
import { en, type Pack } from './en.ts';

type LazyLanguage = Exclude<Language, 'en' | 'de'>;

/**
 * Every language but English and German, each its own chunk. The calls are
 * literal on purpose: Vite splits only the imports it can read, and the server
 * finds each chunk in the build manifest under `src/i18n/<code>.ts`.
 */
const LOADERS: Record<LazyLanguage, () => Promise<Pack>> = {
  ar: () => import('./ar.ts').then((m) => ({ texts: m.ar, forms: m.arForms })),
  cs: () =>
    import('./cs.ts').then((m) => ({ texts: m.cs, forms: { few: m.csFew } })),
  es: () => import('./es.ts').then((m) => ({ texts: m.es })),
  'es-419': () => import('./es-419.ts').then((m) => ({ texts: m.es419 })),
  fa: () => import('./fa.ts').then((m) => ({ texts: m.fa })),
  fi: () => import('./fi.ts').then((m) => ({ texts: m.fi })),
  fr: () => import('./fr.ts').then((m) => ({ texts: m.fr })),
  id: () => import('./id.ts').then((m) => ({ texts: m.id })),
  it: () => import('./it.ts').then((m) => ({ texts: m.it })),
  ja: () => import('./ja.ts').then((m) => ({ texts: m.ja })),
  ko: () => import('./ko.ts').then((m) => ({ texts: m.ko })),
  nb: () => import('./nb.ts').then((m) => ({ texts: m.nb })),
  nl: () => import('./nl.ts').then((m) => ({ texts: m.nl })),
  pl: () =>
    import('./pl.ts').then((m) => ({ texts: m.pl, forms: { few: m.plFew } })),
  pt: () => import('./pt.ts').then((m) => ({ texts: m.pt })),
  'pt-BR': () => import('./pt-BR.ts').then((m) => ({ texts: m.ptBr })),
  ru: () =>
    import('./ru.ts').then((m) => ({ texts: m.ru, forms: { few: m.ruFew } })),
  sv: () => import('./sv.ts').then((m) => ({ texts: m.sv })),
  tr: () => import('./tr.ts').then((m) => ({ texts: m.tr })),
  uk: () =>
    import('./uk.ts').then((m) => ({ texts: m.uk, forms: { few: m.ukFew } })),
  ur: () => import('./ur.ts').then((m) => ({ texts: m.ur })),
  vi: () => import('./vi.ts').then((m) => ({ texts: m.vi })),
  'zh-Hans': () => import('./zh-Hans.ts').then((m) => ({ texts: m.zhHans })),
  'zh-Hant': () => import('./zh-Hant.ts').then((m) => ({ texts: m.zhHant })),
};

/** English and German ship with the app; the rest load when first needed. */
export const dictionaries = createLazyCache<Language, Pack>(LOADERS, {
  en: { texts: en },
  de: { texts: de },
});

/** Every language at once, for tests that translate synchronously. */
export async function preloadAllDictionaries(): Promise<void> {
  await Promise.all(LANGUAGES.map((language) => dictionaries.load(language)));
}
