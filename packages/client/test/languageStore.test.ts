import type { Language } from '@owl/shared';
import { describe, expect, it, vi } from 'vitest';
import { en, type Pack } from '../src/i18n/en.ts';
import { createLazyCache } from '../src/lib/lazyCache.ts';
import { LanguageStore, startLanguage } from '../src/lib/languageStore.ts';
import { ReloadGuard } from '../src/lib/reloadGuard.ts';
import type { Backing } from '../src/lib/storage.ts';

class MemorySession implements Backing {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const PACK: Pack = { texts: en };

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Pack>((yes, no) => {
    resolve = () => yes(PACK);
    reject = no;
  });
  return { promise, resolve, reject, load: () => promise };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const ok = () => Promise.resolve(PACK);

function harness(
  loaders: Partial<Record<Language, () => Promise<Pack>>>,
  online = true
) {
  const cache = createLazyCache<Language, Pack>(loaders, {
    en: PACK,
    de: PACK,
  });
  const remember = vi.fn<(language: Language) => void>();
  const reloadPage = vi.fn<() => void>();
  const session = new MemorySession();
  const guard = new ReloadGuard({
    session,
    reloadPage,
    online: () => online,
    remember,
  });
  const store = (language: Language = 'en') =>
    new LanguageStore(
      { language, choice: language, failed: null },
      { cache, guard, remember }
    );
  return { cache, guard, remember, reloadPage, session, store };
}

describe('LanguageStore', () => {
  it('switches at once to a language whose texts are here, and remembers it', () => {
    const { store, remember } = harness({});
    const languages = store();
    languages.request('de');
    expect(languages.getState()).toEqual({
      language: 'de',
      choice: 'de',
      failed: null,
    });
    expect(remember).toHaveBeenCalledWith('de');
  });

  it('keeps the page until a language arrives, the select showing it already', async () => {
    const ja = deferred();
    const { store, remember } = harness({ ja: ja.load });
    const languages = store();
    languages.request('ja');
    expect(languages.getState()).toEqual({
      language: 'en',
      choice: 'ja',
      failed: null,
    });
    expect(remember).not.toHaveBeenCalled();
    ja.resolve();
    await settle();
    expect(languages.getState()).toEqual({
      language: 'ja',
      choice: 'ja',
      failed: null,
    });
    expect(remember).toHaveBeenCalledWith('ja');
  });

  it('lets the latest request win, whichever loads first', async () => {
    const ja = deferred();
    const fa = deferred();
    const { store, remember } = harness({ ja: ja.load, fa: fa.load });
    const languages = store();
    languages.request('ja');
    languages.request('fa');
    fa.resolve();
    await settle();
    ja.resolve();
    await settle();
    expect(languages.getState().language).toBe('fa');
    expect(remember.mock.calls).toEqual([['fa']]);
  });

  it('ignores a failure of a switch that a later one replaced', async () => {
    const ja = deferred();
    const { store, reloadPage } = harness({ ja: ja.load, fa: ok });
    const languages = store();
    languages.request('ja');
    languages.request('fa');
    await settle();
    ja.reject(new Error('gone'));
    await settle();
    expect(reloadPage).not.toHaveBeenCalled();
    expect(languages.getState()).toEqual({
      language: 'fa',
      choice: 'fa',
      failed: null,
    });
  });

  it('drops a switch under way when the shown language is chosen again', async () => {
    const ja = deferred();
    const { store, remember } = harness({ ja: ja.load });
    const languages = store();
    languages.request('ja');
    languages.request('en');
    expect(languages.getState()).toEqual({
      language: 'en',
      choice: 'en',
      failed: null,
    });
    ja.resolve();
    await settle();
    expect(languages.getState().language).toBe('en');
    expect(remember).not.toHaveBeenCalled();
  });

  it('reloads once when a language fails to load', async () => {
    const { store, reloadPage, remember, guard } = harness({
      ja: () => Promise.reject(new Error('gone')),
    });
    const languages = store('de');
    languages.request('ja');
    await settle();
    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(remember).toHaveBeenCalledWith('ja');
    expect(guard.flag()).toEqual({ language: 'ja', previous: 'de' });
  });

  it('stays put with a message when it cannot reload, and clears it on success', async () => {
    const load = vi
      .fn<() => Promise<Pack>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(PACK);
    const { store, reloadPage, remember } = harness({ ja: load }, false);
    const languages = store('de');
    languages.request('ja');
    await settle();
    expect(reloadPage).not.toHaveBeenCalled();
    expect(remember).not.toHaveBeenCalled();
    expect(languages.getState()).toEqual({
      language: 'de',
      choice: 'de',
      failed: 'ja',
    });
    languages.request('ja');
    await settle();
    expect(languages.getState()).toEqual({
      language: 'ja',
      choice: 'ja',
      failed: null,
    });
  });
});

describe('startLanguage', () => {
  const start = (
    h: ReturnType<typeof harness>,
    path: string,
    stored: Language | null,
    browser: readonly string[] = []
  ) =>
    startLanguage({
      cache: h.cache,
      guard: h.guard,
      remember: h.remember,
      path,
      browser,
      stored: () => stored,
    });

  it('starts in the address language, then the stored one, then the browser', async () => {
    const h = harness({ fa: ok, ja: ok, ko: ok, 'pt-BR': ok });
    expect((await start(h, '/fa', 'ja', ['ko']))?.getState().language).toBe(
      'fa'
    );
    expect(h.remember).toHaveBeenCalledWith('fa');
    h.remember.mockClear();
    expect((await start(h, '/', 'ja', ['ko']))?.getState().language).toBe('ja');
    expect((await start(h, '/privacy', null, ['pt-BR']))?.getState()).toEqual({
      language: 'pt-BR',
      choice: 'pt-BR',
      failed: null,
    });
    expect((await start(h, '/', null, []))?.getState().language).toBe('en');
    expect(h.remember).not.toHaveBeenCalled();
  });

  it('remembers an address language only once it has loaded', async () => {
    const h = harness({ fa: () => Promise.reject(new Error('gone')) }, false);
    const languages = await start(h, '/fa', null);
    expect(h.remember).not.toHaveBeenCalled();
    expect(languages?.getState()).toEqual({
      language: 'en',
      choice: 'en',
      failed: 'fa',
    });
  });

  it('reloads when the language fails, and gives null for the page going away', async () => {
    const h = harness({ fa: () => Promise.reject(new Error('gone')) });
    await expect(start(h, '/fa', null)).resolves.toBeNull();
    expect(h.reloadPage).toHaveBeenCalledTimes(1);
  });

  it('falls back to the language before the reload, else English', async () => {
    const fails = () => Promise.reject(new Error('gone'));
    const h = harness({ fa: fails, ja: fails });
    h.session.setItem(
      'owl.i18n-reload',
      JSON.stringify({ language: 'fa', previous: 'de' })
    );
    expect((await start(h, '/', 'fa'))?.getState()).toEqual({
      language: 'de',
      choice: 'de',
      failed: 'fa',
    });
    h.session.setItem(
      'owl.i18n-reload',
      JSON.stringify({ language: 'fa', previous: 'ja' })
    );
    expect((await start(h, '/', 'fa'))?.getState().language).toBe('en');
    expect(h.reloadPage).not.toHaveBeenCalled();
  });

  it('forgets the reload once the language has loaded after it', async () => {
    const h = harness({ fa: ok });
    h.session.setItem(
      'owl.i18n-reload',
      JSON.stringify({ language: 'fa', previous: null })
    );
    await start(h, '/', 'fa');
    expect(h.guard.flag()).toBeNull();
  });
});
