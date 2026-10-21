/**
 * Checks the built client after `npm run build`: the code every visitor
 * loads stays under a budget, and holds the English and German texts but no
 * other language's — those load as chunks of their own.
 *
 *     npm run build
 *     npm run check:bundle
 *
 * It reads Vite's manifest (packages/client/dist/.vite/manifest.json) and the
 * chunks it names, and the dictionaries themselves, to know what to look for.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { LANGUAGES, type Language } from '@owl/shared';
import {
  dictionaries,
  STATIC_LANGUAGES,
} from '../packages/client/src/i18n/dictionaries.ts';

/**
 * The most the entry chunk and its static imports may weigh, in bytes. A
 * ceiling, not a target: never raise it to make a change fit — make the
 * change load later instead.
 */
export const BUDGET_BYTES = 520_000;

export interface ManifestEntry {
  file: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
}

export type Manifest = Record<string, ManifestEntry>;

/** The files every visitor loads: the one entry and its static imports. */
export function initialFiles(manifest: Manifest): string[] {
  const entries = Object.entries(manifest).filter(([, entry]) => entry.isEntry);
  if (entries.length !== 1)
    throw new Error(`expected one entry, found ${entries.length}`);
  const files: string[] = [];
  const seen = new Set<string>();
  const walk = (key: string): void => {
    const entry = manifest[key];
    if (!entry || seen.has(key)) return;
    seen.add(key);
    files.push(entry.file);
    for (const next of entry.imports ?? []) walk(next);
  };
  walk(entries[0]![0]);
  return files;
}

/** The languages the manifest has a chunk for, by their source path. */
export function chunkLanguages(manifest: Manifest): string[] {
  return Object.entries(manifest)
    .filter(([, entry]) => entry.isDynamicEntry)
    .flatMap(([key]) => /^src\/i18n\/(.+)\.ts$/.exec(key)?.[1] ?? [])
    .sort();
}

/**
 * Up to three long texts per language that no other language has, to tell
 * the languages apart in minified code. Texts with placeholders, quotes,
 * backslashes or line breaks are left out: the minifier may write those
 * differently from the source.
 */
// The bundler writes a no-break space as `\xA0`; the dictionaries hold the character.
export function decodeSpaceEscapes(code: string): string {
  return code.replace(/\\(?:xa0|u00a0|u\{a0\})/gi, '\u00a0');
}

export function uniqueMarkers(
  texts: Partial<Record<Language, Record<string, string>>>
): Partial<Record<Language, string[]>> {
  const counts = new Map<string, number>();
  for (const dictionary of Object.values(texts))
    for (const text of new Set(Object.values(dictionary ?? {})))
      counts.set(text, (counts.get(text) ?? 0) + 1);
  return Object.fromEntries(
    Object.entries(texts).map(([language, dictionary]) => [
      language,
      [...new Set(Object.values(dictionary ?? {}))]
        .filter(
          (text) =>
            text.length >= 30 &&
            counts.get(text) === 1 &&
            !/[{}"'`\\\n]/.test(text)
        )
        .sort((a, b) => b.length - a.length || a.localeCompare(b))
        .slice(0, 3),
    ])
  );
}

/** What is wrong with the build; empty when nothing is. */
export function problems(options: {
  manifest: Manifest;
  read(file: string): string;
  markers: Partial<Record<Language, string[]>>;
  budget?: number;
}): string[] {
  const { manifest, markers } = options;
  const read = (file: string) => decodeSpaceEscapes(options.read(file));
  const budget = options.budget ?? BUDGET_BYTES;
  const found: string[] = [];
  const lazy = LANGUAGES.filter((code) => !STATIC_LANGUAGES.includes(code));
  const chunks = chunkLanguages(manifest);
  if (chunks.join() !== [...lazy].sort().join())
    found.push(
      `language chunks are ${chunks.join(', ') || 'none'}; expected ${[...lazy].sort().join(', ')}`
    );
  const raw = initialFiles(manifest)
    .map((file) => options.read(file))
    .join('\n');
  const size = Buffer.byteLength(raw);
  const initial = decodeSpaceEscapes(raw);
  if (size > budget)
    found.push(`the entry weighs ${size} bytes, over the ${budget} budget`);
  for (const language of LANGUAGES) {
    const own = markers[language] ?? [];
    if (own.length === 0) {
      found.push(`${language} has no text to recognise it by`);
      continue;
    }
    const inEntry = own.some((marker) => initial.includes(marker));
    if (STATIC_LANGUAGES.includes(language)) {
      if (!inEntry) found.push(`the ${language} texts are not in the entry`);
    } else if (inEntry) {
      found.push(`the ${language} texts are in the entry`);
    } else {
      const entry = manifest[`src/i18n/${language}.ts`];
      if (entry && !own.some((marker) => read(entry.file).includes(marker)))
        found.push(`the ${language} chunk lacks its own texts`);
    }
  }
  return found;
}

async function main(): Promise<void> {
  const dist = resolve(import.meta.dirname, '../packages/client/dist');
  const manifest = JSON.parse(
    readFileSync(join(dist, '.vite', 'manifest.json'), 'utf8')
  ) as Manifest;
  const read = (file: string): string => readFileSync(join(dist, file), 'utf8');
  await Promise.all(LANGUAGES.map((language) => dictionaries.load(language)));
  // Every tagline is in the entry: they come from one shared object, short
  // enough not to be worth a chunk.
  const markers = uniqueMarkers(
    Object.fromEntries(
      LANGUAGES.map((language) => [
        language,
        Object.fromEntries(
          Object.entries(dictionaries.peek(language)!.texts).filter(
            ([key]) => key !== 'app.tagline'
          )
        ),
      ])
    )
  );
  const initial = Buffer.from(initialFiles(manifest).map(read).join('\n'));
  console.log(
    `entry: ${initial.length} bytes (${gzipSync(initial).length} gzipped), budget ${BUDGET_BYTES}`
  );
  const found = problems({ manifest, read, markers });
  for (const problem of found) console.error(`✗ ${problem}`);
  if (found.length > 0) process.exit(1);
  console.log('✓ English and German in the entry, every other language apart');
}

if (import.meta.main) await main();
