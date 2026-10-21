import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { precompress } from './precompress.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'owl-precompress-'));
  dirs.push(dir);
  return dir;
};
const BIG = 'const x = "owl";\n'.repeat(200);

describe('precompress', () => {
  it('writes .br and .gz copies that decompress to the original', () => {
    const dir = tmp();
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'app.js'), BIG);
    expect(precompress(dir)).toHaveLength(2);
    expect(
      brotliDecompressSync(
        readFileSync(join(dir, 'assets', 'app.js.br'))
      ).toString()
    ).toBe(BIG);
    expect(
      gunzipSync(readFileSync(join(dir, 'assets', 'app.js.gz'))).toString()
    ).toBe(BIG);
  });

  it('leaves binary formats, tiny files and dot directories alone', () => {
    const dir = tmp();
    mkdirSync(join(dir, '.vite'));
    writeFileSync(join(dir, '.vite', 'manifest.json'), BIG);
    writeFileSync(join(dir, 'font.woff2'), BIG);
    writeFileSync(join(dir, 'tiny.css'), 'a{}');
    expect(precompress(dir)).toEqual([]);
    expect(existsSync(join(dir, '.vite', 'manifest.json.br'))).toBe(false);
    expect(existsSync(join(dir, 'font.woff2.br'))).toBe(false);
    expect(existsSync(join(dir, 'tiny.css.gz'))).toBe(false);
  });

  it('writes no copy that is not smaller, and handles an empty directory', () => {
    const dir = tmp();
    expect(precompress(dir)).toEqual([]);
    const noise = Buffer.from(
      Array.from(
        { length: 2000 },
        (_, i) => (i * 7919 + (i >> 3) * 104729) % 251
      )
    );
    writeFileSync(join(dir, 'noise.json'), noise);
    for (const path of precompress(dir))
      expect(readFileSync(path).length).toBeLessThan(2000);
  });
});
