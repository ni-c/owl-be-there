/**
 * Writes a Brotli (.br) and a gzip (.gz) copy next to every compressible file
 * of the built client, for `@fastify/static`'s `preCompressed` option. The
 * server then compresses nothing at request time, and the API's JSON, which
 * carries tokens beside echoed input, stays uncompressed (BREACH).
 *
 *     node scripts/precompress.ts packages/client/dist
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

/** Text formats only: woff2 and png are compressed already. */
const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.svg', '.json', '.txt']);

/** Below this a copy saves nothing worth a second file. */
const MIN_BYTES = 256;

/** Every file below `dir`, skipping dot directories such as `.vite`. */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

/** Compresses the files of `dir`; returns the paths written. A copy that is not smaller is not written. */
export function precompress(dir: string): string[] {
  const written: string[] = [];
  for (const path of walk(dir)) {
    if (!COMPRESSIBLE.has(extname(path))) continue;
    const input = readFileSync(path);
    if (input.length < MIN_BYTES) continue;
    const copies: [string, Buffer][] = [
      [
        '.br',
        brotliCompressSync(input, {
          params: {
            [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
            [constants.BROTLI_PARAM_SIZE_HINT]: input.length,
          },
        }),
      ],
      ['.gz', gzipSync(input, { level: 9 })],
    ];
    for (const [suffix, data] of copies) {
      if (data.length >= input.length) continue;
      writeFileSync(path + suffix, data);
      written.push(path + suffix);
    }
  }
  return written;
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const dir = process.argv[2];
  if (!dir || !statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error('usage: node scripts/precompress.ts <directory>');
    process.exit(1);
  }
  const written = precompress(dir);
  console.log(`precompress: ${written.length} files written in ${dir}`);
}
