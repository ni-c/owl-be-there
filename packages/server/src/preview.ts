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

/** Renders per second the renderer sustains, and how many it does in a burst. */
export interface RenderBudget {
  burst: number;
  perSecond: number;
}

const DEFAULT_BUDGET: RenderBudget = { burst: 10, perSecond: 5 };

export interface PreviewOptions {
  /** A ceiling on new pictures, or null for none; cache hits cost nothing. */
  budget?: RenderBudget | null;
  /** The time in milliseconds; a test can move it. */
  now?: () => number;
}

/** The renderer has drawn its share for now; try again after `retryAfter` seconds. */
export class PreviewBusy extends Error {
  readonly retryAfter: number;

  constructor(retryAfter: number) {
    super('Too many pictures are being drawn right now');
    this.name = 'PreviewBusy';
    this.retryAfter = retryAfter;
  }
}

/**
 * Turns an event's preview SVG into a PNG.
 *
 * Everything here is WebAssembly or plain files — no native module — so the
 * image built on one architecture runs on the other unchanged. resvg reads
 * TrueType and OpenType only; the fonts ship as WOFF2 and are unpacked once,
 * on first use. The large Japanese font is read only when a picture needs it.
 *
 * A picture is drawn on the main thread and every change to an event asks for
 * a new one, so drawing has a budget of its own on top of the per-client rate
 * limit: a token bucket for the whole instance.
 */
export class PreviewRenderer {
  private ready: Promise<void> | null = null;
  private latin: Promise<Uint8Array[]> | null = null;
  private cjk: Promise<Uint8Array | null> | null = null;
  private owl: Promise<string | null> | null = null;
  private readonly cache = new Map<string, Buffer>();
  /** Pictures being drawn, so two requests for one version draw it once. */
  private readonly drawing = new Map<string, Promise<Buffer>>();

  private readonly clientDir: string | null;
  private readonly host: string;
  /** Pictures kept in memory, the least recently used dropped first. */
  private readonly cacheSize: number;
  private readonly budget: RenderBudget | null;
  private readonly now: () => number;
  private tokens: number;
  private refilled: number;

  constructor(
    clientDir: string | null,
    host: string,
    cacheSize = 200,
    options: PreviewOptions = {}
  ) {
    this.clientDir = clientDir;
    this.host = host;
    this.cacheSize = cacheSize;
    this.budget =
      options.budget === undefined ? DEFAULT_BUDGET : options.budget;
    this.now = options.now ?? Date.now;
    this.tokens = this.budget?.burst ?? 0;
    this.refilled = this.now();
  }

  /**
   * The PNG for this state of the event; the same version is drawn once.
   * Throws {@link PreviewBusy} when a new picture is due and the budget is
   * spent.
   */
  async render(data: EventSnapshotData): Promise<Buffer> {
    const key = `${data.event.id}:${data.event.version}`;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const pending = this.drawing.get(key);
    if (pending) return pending;
    const wait = this.take();
    if (wait > 0) throw new PreviewBusy(wait);
    const job = this.draw(key, data).finally(() => this.drawing.delete(key));
    this.drawing.set(key, job);
    return job;
  }

  /** Spend a token: 0 when there was one, else the seconds until there is. */
  private take(): number {
    if (!this.budget) return 0;
    const now = this.now();
    const elapsed = Math.max(0, now - this.refilled) / 1000;
    this.refilled = now;
    this.tokens = Math.min(
      this.budget.burst,
      this.tokens + elapsed * this.budget.perSecond
    );
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    return Math.max(1, Math.ceil((1 - this.tokens) / this.budget.perSecond));
  }

  private async draw(key: string, data: EventSnapshotData): Promise<Buffer> {
    await this.init();
    const fonts = [...(await this.latinFonts())];
    if (previewNeedsCjk(data)) {
      const cjk = await this.cjkFont();
      if (cjk) fonts.push(cjk);
    }
    const svg = previewSvg(data, { host: this.host, owl: await this.owlUri() });
    const png = rasterise(svg, fonts);
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

/**
 * The SVG as PNG bytes. The renderer and the image live in WebAssembly memory
 * that no garbage collection sees the size of: each one holds the fonts or a
 * 1200 by 630 pixmap until it is freed by hand.
 */
function rasterise(svg: string, fonts: Uint8Array[]): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: PREVIEW_WIDTH },
    font: { fontBuffers: fonts, defaultFontFamily: 'Nunito' },
  });
  try {
    const image = resvg.render();
    try {
      // A copy: the bytes are a view into memory the image owns.
      return Buffer.from(image.asPng());
    } finally {
      image.free();
    }
  } finally {
    resvg.free();
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
