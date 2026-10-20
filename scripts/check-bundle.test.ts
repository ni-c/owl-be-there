import { LANGUAGES, type Language } from '@owl/shared';
import { describe, expect, it } from 'vitest';
import {
  chunkLanguages,
  initialFiles,
  problems,
  STATIC_LANGUAGES,
  uniqueMarkers,
  type Manifest,
} from './check-bundle.ts';

const LAZY = LANGUAGES.filter((code) => !STATIC_LANGUAGES.includes(code));

/** A build as it should be: one entry with the English and German texts, a chunk per other language. */
function build(): { manifest: Manifest; files: Record<string, string> } {
  const manifest: Manifest = {
    'index.html': {
      file: 'assets/index.js',
      isEntry: true,
      imports: ['_vendor.js'],
    },
    '_vendor.js': { file: 'assets/vendor.js', imports: ['index.html'] },
  };
  const files: Record<string, string> = {
    'assets/index.js': 'app;"marker en";"marker de";',
    'assets/vendor.js': 'react;',
  };
  for (const language of LAZY) {
    manifest[`src/i18n/${language}.ts`] = {
      file: `assets/${language}.js`,
      isDynamicEntry: true,
      imports: ['index.html'],
    };
    files[`assets/${language}.js`] = `"marker ${language}"`;
  }
  return { manifest, files };
}

const MARKERS = Object.fromEntries(
  LANGUAGES.map((language) => [language, [`marker ${language}`]])
) as Record<Language, string[]>;

const check = (
  manifest: Manifest,
  files: Record<string, string>,
  budget = 1000
) =>
  problems({
    manifest,
    read: (file) => files[file] ?? '',
    markers: MARKERS,
    budget,
  });

describe('initialFiles', () => {
  it('takes the entry and its static imports, each once', () => {
    expect(initialFiles(build().manifest)).toEqual([
      'assets/index.js',
      'assets/vendor.js',
    ]);
  });

  it('wants exactly one entry', () => {
    expect(() => initialFiles({})).toThrow('expected one entry, found 0');
    expect(() =>
      initialFiles({
        a: { file: 'a.js', isEntry: true },
        b: { file: 'b.js', isEntry: true },
      })
    ).toThrow('expected one entry, found 2');
  });
});

describe('chunkLanguages', () => {
  it('reads the languages from the dynamic entries’ source paths', () => {
    expect(
      chunkLanguages({
        'src/i18n/fa.ts': { file: 'x', isDynamicEntry: true },
        'src/i18n/zh-Hant.ts': { file: 'y', isDynamicEntry: true },
        'src/i18n/de.ts': { file: 'z' },
        'src/lib/other.ts': { file: 'w', isDynamicEntry: true },
      })
    ).toEqual(['fa', 'zh-Hant']);
  });
});

describe('uniqueMarkers', () => {
  it('takes the longest texts no other language shares, and leaves out the risky ones', () => {
    const long = (word: string) => `${word} ${'x'.repeat(30)}`;
    expect(
      uniqueMarkers({
        es: { a: long('compartido'), b: long('España'), c: 'corto' },
        'es-419': { a: long('compartido'), b: long('Latinoamérica') },
        fr: {
          a: long('avec {count}'),
          b: long('l’apostrophe'),
          c: long("l'ASCII"),
          d: `${long('deux')}\nlignes`,
          e: long('a') + 'z',
          f: long('bb'),
          g: long('ccc'),
          h: long('dddd'),
        },
      })
    ).toEqual({
      es: [long('España')],
      'es-419': [long('Latinoamérica')],
      fr: [long('l’apostrophe'), long('dddd'), long('ccc')],
    });
  });
});

describe('problems', () => {
  it('finds nothing wrong with a good build', () => {
    const { manifest, files } = build();
    expect(check(manifest, files)).toEqual([]);
  });

  it('notices a language in the entry, a chunk without its texts and a missing chunk', () => {
    const { manifest, files } = build();
    files['assets/vendor.js'] += '"marker fa"';
    files['assets/ja.js'] = '"something else"';
    delete manifest['src/i18n/ko.ts'];
    files['assets/index.js'] = 'app;"marker en";';
    expect(check(manifest, files)).toEqual([
      expect.stringContaining('language chunks are'),
      'the de texts are not in the entry',
      'the fa texts are in the entry',
      'the ja chunk lacks its own texts',
    ]);
  });

  it('holds the entry to the budget', () => {
    const { manifest, files } = build();
    expect(check(manifest, files, 10)).toEqual([
      expect.stringMatching(/^the entry weighs \d+ bytes, over the 10 budget$/),
    ]);
  });

  it('wants a text to recognise every language by', () => {
    const { manifest, files } = build();
    expect(
      problems({
        manifest,
        read: (file) => files[file] ?? '',
        markers: { ...MARKERS, fa: [] },
        budget: 1000,
      })
    ).toEqual(['fa has no text to recognise it by']);
  });
});
