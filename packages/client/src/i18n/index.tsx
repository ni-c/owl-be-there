import { isRtl, LANGUAGES, LOCALES, type Language } from '@owl/shared';
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
import { ar, arForms } from './ar.ts';
import { cs, csFew } from './cs.ts';
import { de } from './de.ts';
import { en, type Dictionary, type TranslationKey } from './en.ts';
import { es } from './es.ts';
import { es419 } from './es-419.ts';
import { fa } from './fa.ts';
import { fi } from './fi.ts';
import { fr } from './fr.ts';
import { id } from './id.ts';
import { it } from './it.ts';
import { ja } from './ja.ts';
import { ko } from './ko.ts';
import { nb } from './nb.ts';
import { nl } from './nl.ts';
import { pl, plFew } from './pl.ts';
import { pt } from './pt.ts';
import { ptBr } from './pt-BR.ts';
import { ru, ruFew } from './ru.ts';
import { sv } from './sv.ts';
import { tr } from './tr.ts';
import { uk, ukFew } from './uk.ts';
import { ur } from './ur.ts';
import { vi } from './vi.ts';
import { zhHans } from './zh-Hans.ts';
import { zhHant } from './zh-Hant.ts';

const DICTIONARIES: Record<Language, Dictionary> = {
  ar,
  cs,
  de,
  en,
  es,
  'es-419': es419,
  fa,
  fi,
  fr,
  id,
  it,
  ja,
  ko,
  nb,
  nl,
  pl,
  pt,
  'pt-BR': ptBr,
  ru,
  sv,
  tr,
  uk,
  ur,
  vi,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
};

/** Keys that come in `_one` / `_other` pairs, without the suffix. */
export type CountedKey = {
  [K in TranslationKey]: K extends `${infer Base}_other` ? Base : never;
}[TranslationKey];

const FEW_FORMS: Partial<
  Record<Language, Partial<Record<CountedKey, string>>>
> = { cs: csFew, pl: plFew, ru: ruFew, uk: ukFew };

const ARABIC_FORMS = arForms;

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
    const normalized = tag.toLowerCase();
    if (/^zh-(hant|tw|hk|mo)(-|$)/.test(normalized)) return 'zh-Hant';
    if (normalized === 'zh' || /^zh-(hans|cn|sg)(-|$)/.test(normalized))
      return 'zh-Hans';
    if (/^pt-br(-|$)/.test(normalized)) return 'pt-BR';
    // Spain says vosotros; every other region gets the Latin American texts.
    if (/^es-(?!es(-|$))/.test(normalized)) return 'es-419';
    const base = normalized.split('-')[0]!;
    if (base === 'no') return 'nb';
    const match = LANGUAGES.find((language) => language === base);
    if (match) return match;
  }
  return 'en';
}

export function translator(language: Language) {
  const dictionary = DICTIONARIES[language];
  const plural = new Intl.PluralRules(LOCALES[language]);
  const digits = new Intl.NumberFormat(LOCALES[language], {
    useGrouping: false,
  });
  /** A number in the language's own digits: Persian writes ۲۳, as its dates do. */
  const number = (value: number): string => digits.format(value);
  const localized = (params: Params = {}): Params =>
    Object.fromEntries(
      Object.entries(params).map(([name, value]) => [
        name,
        typeof value === 'number' ? number(value) : value,
      ])
    );
  const t = (key: TranslationKey, params?: Params): string =>
    interpolate(dictionary[key], localized(params));
  /** A counted text: `{count}` is filled in and the plural form chosen. */
  const tn = (key: CountedKey, count: number, params: Params = {}): string => {
    const category = plural.select(count);
    const text =
      (language === 'ar' && category !== 'one' && category !== 'other'
        ? ARABIC_FORMS[category]?.[key]
        : undefined) ??
      (category === 'few' ? FEW_FORMS[language]?.[key] : undefined) ??
      dictionary[
        `${key}_${category === 'one' ? 'one' : 'other'}` as TranslationKey
      ];
    return interpolate(text, localized({ ...params, count }));
  };
  return { t, tn, number };
}

interface I18n {
  language: Language;
  locale: string;
  setLanguage(language: Language): void;
  t(key: TranslationKey, params?: Params): string;
  tn(key: CountedKey, count: number, params?: Params): string;
  number(value: number): string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const route = parseRoute(window.location.pathname);
    const fromPath = route.page === 'home' ? (route.language ?? null) : null;
    // Arriving on `/fr` is a choice of French; the event pages keep it.
    if (fromPath) writeLanguage(fromPath);
    return detectLanguage(readLanguage(), navigator.languages, fromPath);
  });
  const setLanguage = useCallback((next: Language) => {
    writeLanguage(next);
    setLanguageState(next);
  }, []);
  const value = useMemo<I18n>(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isRtl(language) ? 'rtl' : 'ltr';
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
