import { LANGUAGES, LOCALES, type Language } from '@owl/shared';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { readLanguage, writeLanguage } from '../lib/prefs.ts';
import { parseRoute } from '../lib/route.ts';
import { de } from './de.ts';
import { en, type Dictionary, type TranslationKey } from './en.ts';
import { es } from './es.ts';
import { fr } from './fr.ts';
import { it } from './it.ts';
import { ja } from './ja.ts';
import { nl } from './nl.ts';
import { pt } from './pt.ts';

const DICTIONARIES: Record<Language, Dictionary> = {
  de,
  en,
  es,
  fr,
  it,
  ja,
  nl,
  pt,
};

/** Keys that come in `_one` / `_other` pairs, without the suffix. */
type CountedKey = {
  [K in TranslationKey]: K extends `${infer Base}_other` ? Base : never;
}[TranslationKey];

export type Params = Record<string, string | number>;

/** Fill `{name}` placeholders; a missing parameter stays visible as `{name}`. */
export function interpolate(text: string, params: Params = {}): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match
  );
}

/**
 * The language to start in: the one in the address (`/de`), else what was
 * chosen before, else the first of the browser's languages that the app
 * speaks, else English.
 */
export function detectLanguage(
  stored: Language | null,
  browser: readonly string[],
  fromPath: Language | null = null
): Language {
  if (fromPath) return fromPath;
  if (stored) return stored;
  for (const tag of browser) {
    const base = tag.toLowerCase().split('-')[0]!;
    const match = LANGUAGES.find((language) => language === base);
    if (match) return match;
  }
  return 'en';
}

export function translator(language: Language) {
  const dictionary = DICTIONARIES[language];
  const plural = new Intl.PluralRules(LOCALES[language]);
  const t = (key: TranslationKey, params?: Params): string =>
    interpolate(dictionary[key], params);
  /** A counted text: `{count}` is filled in and the plural form chosen. */
  const tn = (key: CountedKey, count: number, params: Params = {}): string => {
    const form = plural.select(count) === 'one' ? 'one' : 'other';
    return interpolate(dictionary[`${key}_${form}` as TranslationKey], {
      ...params,
      count,
    });
  };
  return { t, tn };
}

export interface I18n {
  language: Language;
  locale: string;
  setLanguage(language: Language): void;
  t(key: TranslationKey, params?: Params): string;
  tn(key: CountedKey, count: number, params?: Params): string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const route = parseRoute(window.location.pathname);
    const fromPath = route.page === 'home' ? (route.language ?? null) : null;
    // Arriving on `/fr` is a choice of French; the event pages keep it.
    if (fromPath) writeLanguage(fromPath);
    return detectLanguage(
      readLanguage(),
      navigator.languages ?? [navigator.language],
      fromPath
    );
  });
  const setLanguage = useCallback((next: Language) => {
    writeLanguage(next);
    setLanguageState(next);
  }, []);
  const value = useMemo<I18n>(() => {
    document.documentElement.lang = language;
    return {
      language,
      locale: LOCALES[language],
      setLanguage,
      ...translator(language),
    };
  }, [language, setLanguage]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n outside I18nProvider');
  return value;
}
