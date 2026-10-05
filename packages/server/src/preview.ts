import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import {
  previewNeedsCjk,
  previewSvg,
  PREVIEW_WIDTH,
  type EventSnapshotData,
} from '@owl/shared';

const require = createRequire(import.meta.url);
// CommonJS without types: the one function used here.
const wawoff2 = require('wawoff2') as {
  decompress(woff2: Uint8Array): Promise<Uint8Array>;
};

/**
 * WOFF2 to TrueType. wawoff2 answers with a view into its own WebAssembly
 * memory, which the next, larger font grows and so detaches: copy it out.
 */
async function decompress(woff2: Uint8Array): Promise<Uint8Array> {
  return (await wawoff2.decompress(woff2)).slice();
}

/**
 * Turns an event's preview SVG into a PNG.
 *
 * Everything here is WebAssembly or plain files — no native module — so the
 * image built on one architecture runs on the other unchanged. resvg reads
 * TrueType and OpenType only; the fonts ship as WOFF2 and are unpacked once,
 * on first use. The large Japanese font is read only when a picture needs it.
 */
export class PreviewRenderer {
  private ready: Promise<void> | null = null;
  private latin: Promise<Uint8Array[]> | null = null;
  private cjk: Promise<Uint8Array | null> | null = null;
  private owl: Promise<string | null> | null = null;
  private readonly cache = new Map<string, Buffer>();

  private readonly clientDir: string | null;
  private readonly host: string;
  /** Pictures kept in memory, the least recently used dropped first. */
  private readonly cacheSize: number;

  constructor(clientDir: string | null, host: string, cacheSize = 200) {
    this.clientDir = clientDir;
    this.host = host;
    this.cacheSize = cacheSize;
  }

  /** The PNG for this state of the event; the same version is drawn once. */
  async render(data: EventSnapshotData): Promise<Buffer> {
    const key = `${data.event.id}:${data.event.version}`;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    await this.init();
    const fonts = [...(await this.latinFonts())];
    if (previewNeedsCjk(data)) {
      const cjk = await this.cjkFont();
      if (cjk) fonts.push(cjk);
    }
    const svg = previewSvg(data, { host: this.host, owl: await this.owlUri() });
    const png = Buffer.from(
      new Resvg(svg, {
        fitTo: { mode: 'width', value: PREVIEW_WIDTH },
        font: { fontBuffers: fonts, defaultFontFamily: 'Nunito' },
      })
        .render()
        .asPng()
    );
    this.cache.set(key, png);
    if (this.cache.size > this.cacheSize)
      this.cache.delete(this.cache.keys().next().value!);
    return png;
  }

  private init(): Promise<void> {
    this.ready ??= initOnce();
    return this.ready;
  }

  private latinFonts(): Promise<Uint8Array[]> {
    this.latin ??= Promise.all(
      ['latin-400', 'latin-800', 'latin-ext-400', 'latin-ext-800'].map(
        async (name) =>
          decompress(
            await readFile(
              require.resolve(
                `@fontsource/nunito/files/nunito-${name}-normal.woff2`
              )
            )
          )
      )
    );
    return this.latin;
  }

  /** Noto Sans CJK JP from the built client, or null when there is none. */
  private cjkFont(): Promise<Uint8Array | null> {
    this.cjk ??= this.clientFile('fonts/noto-sans-cjk-jp-regular.woff2').then(
      (file) => (file ? decompress(file) : null)
    );
    return this.cjk;
  }

  private owlUri(): Promise<string | null> {
    this.owl ??= this.clientFile('favicon.svg').then((file) =>
      file ? `data:image/svg+xml;base64,${file.toString('base64')}` : null
    );
    return this.owl;
  }

  private async clientFile(path: string): Promise<Buffer | null> {
    if (!this.clientDir) return null;
    try {
      return await readFile(join(this.clientDir, path));
    } catch {
      return null;
    }
  }
}

/** resvg's WebAssembly can be initialised once per process, not per renderer. */
let wasm: Promise<void> | null = null;
function initOnce(): Promise<void> {
  wasm ??= readFile(require.resolve('@resvg/resvg-wasm/index_bg.wasm')).then(
    (bytes) => initWasm(bytes)
  );
  return wasm;
}
