import { LANGUAGES, type Language } from '@owl/shared';
import type { Pack } from '../i18n/en.ts';
import type { LazyCache } from './lazyCache.ts';
import { Observable } from './observable.ts';
import type { ReloadGuard } from './reloadGuard.ts';
import { parseRoute } from './route.ts';

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

export interface LanguageState {
  /** The language the page shows. */
  language: Language;
  /** The language chosen last: ahead of `language` while its texts load. */
  choice: Language;
  /** A language whose texts could not be loaded, for the message; or null. */
  failed: Language | null;
}

export interface LanguageDeps {
  cache: LazyCache<Language, Pack>;
  guard: ReloadGuard;
  /** Store the language as the reader's choice. */
  remember(language: Language): void;
}

/**
 * The page's language. A switch to a language whose texts are not here yet
 * keeps the page as it is until they are, then changes it at once; the
 * select already shows the new choice. The latest request wins.
 */
export class LanguageStore extends Observable<LanguageState> {
  private readonly deps: LanguageDeps;
  private ticket = 0;

  constructor(initial: LanguageState, deps: LanguageDeps) {
    super(initial);
    this.deps = deps;
  }

  request = (next: Language): void => {
    const ticket = ++this.ticket;
    const { language } = this.state;
    if (next === language) {
      this.set({ language, choice: language, failed: null });
      return;
    }
    if (this.deps.cache.peek(next)) {
      this.deps.remember(next);
      this.set({ language: next, choice: next, failed: null });
      return;
    }
    this.set({ language, choice: next, failed: null });
    void this.deps.cache.load(next).then(
      () => {
        if (ticket !== this.ticket) return;
        this.deps.guard.loaded(next);
        this.deps.remember(next);
        this.set({ language: next, choice: next, failed: null });
      },
      () => {
        if (ticket !== this.ticket) return;
        const current = this.state.language;
        if (this.deps.guard.reload(next, current)) return;
        this.set({ language: current, choice: current, failed: next });
      }
    );
  };
}

export interface StartDeps extends LanguageDeps {
  path: string;
  browser: readonly string[];
  stored(): Language | null;
}

/**
 * The language to start in, with its texts loaded. Null when the page reloads
 * to fetch them fresh; it never rejects, as the app must start either way.
 */
export async function startLanguage(
  deps: StartDeps
): Promise<LanguageStore | null> {
  const route = parseRoute(deps.path);
  const fromPath = route.page === 'home' ? (route.language ?? null) : null;
  const wanted = detectLanguage(deps.stored(), deps.browser, fromPath);
  const storeFor = (language: Language, failed: Language | null) =>
    new LanguageStore({ language, choice: language, failed }, deps);
  try {
    await deps.cache.load(wanted);
  } catch {
    // The language the reader came from, if a failed switch reloaded the page.
    const previous = deps.guard.flag()?.previous ?? null;
    if (deps.guard.reload(wanted, previous)) return null;
    const fallback =
      previous && previous !== wanted && (await loads(deps.cache, previous))
        ? previous
        : 'en';
    return storeFor(fallback, wanted);
  }
  deps.guard.loaded(wanted);
  // Arriving on `/fr` is a choice of French; the event pages keep it.
  if (fromPath) deps.remember(fromPath);
  return storeFor(wanted, null);
}

async function loads(
  cache: LazyCache<Language, Pack>,
  language: Language
): Promise<boolean> {
  try {
    await cache.load(language);
    return true;
  } catch {
    return false;
  }
}
