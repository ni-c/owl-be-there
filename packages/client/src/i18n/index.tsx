import { isRtl, LOCALES, type Language } from '@owl/shared';
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { formattingLocale } from '../lib/locale.ts';
import { startLanguage, type LanguageStore } from '../lib/languageStore.ts';
import { readLanguage, writeLanguage } from '../lib/prefs.ts';
import { ReloadGuard } from '../lib/reloadGuard.ts';
import { browserBacking } from '../lib/storage.ts';
import { dictionaries } from './dictionaries.ts';
import type { CountedKey, Pack, TranslationKey } from './en.ts';

export type Params = Record<string, string | number>;

/** Fill `{name}` placeholders; a missing parameter stays visible as `{name}`. */
export function interpolate(text: string, params: Params = {}): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match
  );
}

/**
 * The functions that turn a language's texts into strings; numbers are
 * written the way `locale` writes them, plural forms chosen by the language.
 */
function translatorFor(language: Language, pack: Pack, locale: string) {
  const plural = new Intl.PluralRules(LOCALES[language]);
  const digits = new Intl.NumberFormat(locale, { useGrouping: false });
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
    interpolate(pack.texts[key], localized(params));
  /**
   * A counted text: `{count}` is filled in and the plural form chosen — one
   * the language adds (Czech "few", Arabic "two") if it has it, else `_one`
   * or `_other`.
   */
  const tn = (key: CountedKey, count: number, params: Params = {}): string => {
    const category = plural.select(count);
    const text =
      pack.forms?.[category]?.[key] ??
      pack.texts[
        `${key}_${category === 'one' ? 'one' : 'other'}` as TranslationKey
      ];
    return interpolate(text, localized({ ...params, count }));
  };
  return { t, tn, number };
}

/** The translator for a language whose texts are loaded; it throws otherwise. */
export function translator(
  language: Language,
  locale: string = LOCALES[language]
) {
  const pack = dictionaries.peek(language);
  if (!pack) throw new Error(`The ${language} texts are not loaded`);
  return translatorFor(language, pack, locale);
}

/**
 * The page's language, with its texts loaded first: from the address, the
 * stored choice or the browser. Null when the page reloads instead.
 */
export function startI18n(): Promise<LanguageStore | null> {
  return startLanguage({
    cache: dictionaries,
    guard: new ReloadGuard({
      session: browserBacking('sessionStorage'),
      reloadPage: () => window.location.reload(),
      online: () => navigator.onLine !== false,
      remember: writeLanguage,
    }),
    remember: writeLanguage,
    path: window.location.pathname,
    browser: navigator.languages,
    stored: readLanguage,
  });
}

interface I18n {
  /** The language the page shows. */
  language: Language;
  /** The language chosen last, for the select: ahead while its texts load. */
  choice: Language;
  /** A language whose texts could not be loaded; or null. */
  loadFailed: Language | null;
  /** What dates and numbers are formatted in: the browser's region where it fits. */
  locale: string;
  setLanguage(language: Language): void;
  t(key: TranslationKey, params?: Params): string;
  tn(key: CountedKey, count: number, params?: Params): string;
  number(value: number): string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({
  store,
  children,
}: {
  store: LanguageStore;
  children: ReactNode;
}) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  // Only the shown language rebuilds the texts, not a choice still loading.
  const locale = useMemo(
    () => formattingLocale(state.language, navigator.languages),
    [state.language]
  );
  const texts = useMemo(
    () => translator(state.language, locale),
    [state.language, locale]
  );
  useLayoutEffect(() => {
    document.documentElement.lang = state.language;
    document.documentElement.dir = isRtl(state.language) ? 'rtl' : 'ltr';
  }, [state.language]);
  const value = useMemo<I18n>(
    () => ({
      language: state.language,
      choice: state.choice,
      loadFailed: state.failed,
      locale,
      setLanguage: store.request,
      ...texts,
    }),
    [state, store, texts, locale]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n outside I18nProvider');
  return value;
}
