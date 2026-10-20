import {
  APP_NAME,
  isLanguage,
  LANGUAGES,
  TAGLINES,
  type Language,
} from '@owl/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';
import { detectLanguage } from '../src/lib/languageStore.ts';
import { parseRoute } from '../src/lib/route.ts';

/**
 * The block between the `owl:head` markers is what the server swaps for every
 * page; what is left of it serves the dev server and a raw `/index.html`. It
 * must not carry texts of its own that can drift from the shared ones.
 */
const block = html.slice(
  html.indexOf('<!--owl:head-->'),
  html.indexOf('<!--/owl:head-->')
);

describe('index.html head block', () => {
  it('is delimited by both markers, once', () => {
    expect(html.split('<!--owl:head-->')).toHaveLength(2);
    expect(html.split('<!--/owl:head-->')).toHaveLength(2);
    expect(block.length).toBeGreaterThan(0);
  });

  it('titles the page like the server titles the English start page', () => {
    expect(block).toContain(`<title>${APP_NAME} — ${TAGLINES.en}</title>`);
  });

  it('holds no description of its own', () => {
    expect(block).not.toContain('name="description"');
  });

  it('has the place for the start page text inside #root, once, and stamps the js class first', () => {
    expect(html.split('<!--owl:root-->')).toHaveLength(2);
    expect(html).toContain('<div id="root"><!--owl:root--></div>');
    expect(html.indexOf("classList.add('js')")).toBeLessThan(
      html.indexOf('<body>')
    );
  });
});

describe('the inline script’s dictionary preload', () => {
  const start = html.indexOf('<script>') + '<script>'.length;
  const script = html.slice(start, html.indexOf('</script>', start));
  /** Each lazy language with a file of its own; English and German have none. */
  const FILES = Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      language === 'en' || language === 'de' ? [] : [`/assets/${language}.js`],
    ])
  );

  interface Page {
    path?: string;
    stored?: string | null;
    browser?: readonly string[];
    block?: string | null;
    storage?: 'ok' | 'throws';
  }

  /** Runs the script against a stand-in page; the files it preloaded, and the page. */
  function run(page: Page = {}) {
    const links: { rel: string; href: string; crossOrigin: string | null }[] =
      [];
    const classes: string[] = [];
    const attributes: Record<string, string> = {};
    const block = page.block === undefined ? JSON.stringify(FILES) : page.block;
    const document = {
      documentElement: {
        classList: { add: (name: string) => classes.push(name) },
        setAttribute: (name: string, value: string) => {
          attributes[name] = value;
        },
      },
      getElementById: (id: string) =>
        id === 'owl-i18n' && block !== null ? { textContent: block } : null,
      createElement: () => ({ rel: '', href: '', crossOrigin: null }),
      head: {
        appendChild: (link: (typeof links)[number]) => links.push(link),
      },
    };
    const values: Record<string, string | null> = {
      'owl.lang': page.stored ?? null,
      'owl.theme': '"dark"',
    };
    const localStorage = {
      getItem: (key: string) => {
        if (page.storage === 'throws') throw new Error('blocked');
        return values[key] ?? null;
      },
    };
    const location = { pathname: page.path ?? '/' };
    const navigator = { languages: page.browser ?? [] };
    new Function('document', 'localStorage', 'location', 'navigator', script)(
      document,
      localStorage,
      location,
      navigator
    );
    return { links, classes, attributes };
  }

  /** What the app will start in, as detectLanguage decides it. */
  const expected = (page: Page): string[] => {
    const route = parseRoute(page.path ?? '/');
    const fromPath = route.page === 'home' ? (route.language ?? null) : null;
    let stored: Language | null = null;
    try {
      const value: unknown = JSON.parse(page.stored ?? 'null');
      if (typeof value === 'string' && isLanguage(value)) stored = value;
    } catch {
      stored = null;
    }
    return FILES[detectLanguage(stored, page.browser ?? [], fromPath)]!;
  };

  it('preloads the language from the address, the stored choice or the browser', () => {
    const pages: Page[] = [
      { path: '/fa' },
      { path: '/es-419/', stored: '"ja"' },
      { path: '/de', browser: ['ko'] },
      { path: '/xx', stored: '"ja"' },
      { stored: '"zh-Hant"', browser: ['ko'] },
      { stored: '"xx"', browser: ['pt-BR'] },
      { stored: '{', browser: ['es-MX'] },
      { browser: ['es-ES'] },
      { browser: ['zh'] },
      { browser: ['zh-HK'] },
      { browser: ['no', 'fa'] },
      { browser: ['nn-NO', 'ur-PK'] },
      { browser: ['EN-gb', 'ja'] },
      { path: '/e/abcdefghijkl', browser: ['uk-UA'] },
      {},
    ];
    for (const page of pages) {
      const { links } = run(page);
      expect(
        links.map((link) => link.href),
        JSON.stringify(page)
      ).toEqual(expected(page));
      for (const link of links) {
        expect(link.rel).toBe('modulepreload');
        expect(link.crossOrigin).toBe('');
      }
    }
  });

  it('agrees with detectLanguage for any address, stored value and browser', () => {
    const tag = fc.constantFrom(
      'de-DE',
      'pt-BR',
      'pt-PT',
      'es-MX',
      'es-ES',
      'zh-TW',
      'zh',
      'no',
      'nn',
      'fa-IR',
      'ur',
      'EN-gb',
      'xx',
      'ar-EG'
    );
    fc.assert(
      fc.property(
        fc.constantFrom(
          '/',
          '/fa',
          '/ja/',
          '/xx',
          '/e/abc',
          '/es-419',
          '/pt-BR'
        ),
        fc.oneof(
          fc.constant(null),
          fc.constantFrom(...LANGUAGES).map((code) => JSON.stringify(code)),
          fc.string()
        ),
        fc.array(tag, { maxLength: 3 }),
        (path, stored, browser) => {
          const page = { path, stored, browser };
          expect(run(page).links.map((link) => link.href)).toEqual(
            expected(page)
          );
        }
      )
    );
  });

  it('preloads nothing without a list, or with a broken one, and still stamps the page', () => {
    for (const block of [null, '{', '[]', '{"fa":5}']) {
      const { links, classes, attributes } = run({ path: '/fa', block });
      expect(links, String(block)).toEqual([]);
      expect(classes).toEqual(['js']);
      expect(attributes['data-theme']).toBe('dark');
    }
    // A storage that throws loses the stored choice, not the browser's.
    expect(
      run({ storage: 'throws', browser: ['ja'] }).links.map((l) => l.href)
    ).toEqual(['/assets/ja.js']);
  });

  it('preloads only files of its own build, never another origin or scheme', () => {
    const block = JSON.stringify({
      fa: [
        '/assets/fa-Bx1_2.js',
        'javascript:alert(1)',
        'https://example.org/assets/x.js',
        '//example.org/assets/x.js',
        '/assets/../secret.js',
        '/assets/x.css',
        7,
      ],
    });
    expect(run({ path: '/fa', block }).links.map((l) => l.href)).toEqual([
      '/assets/fa-Bx1_2.js',
    ]);
  });
});
