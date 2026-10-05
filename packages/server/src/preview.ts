import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import {
  previewNeedsCjk,
  previewSvg,
  PREVIEW_WIDTH,
  SERVER_TEXTS,
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
 * A value made once, on first use. A failure is not kept: the next caller
 * tries again, so one transient read error does not spoil every picture until
 * the process restarts. Neither is a null, which stands for a file that could
 * not be read.
 */
class Lazy<T> {
  private value: Promise<T> | null = null;
  private readonly make: () => Promise<T>;

  constructor(make: () => Promise<T>) {
    this.make = make;
  }

  get(): Promise<T> {
    if (!this.value) {
      const forget = (): void => {
        this.value = null;
      };
      this.value = this.make().then(
        (value) => {
          if (value === null) forget();
          return value;
        },
        (error: unknown) => {
          forget();
          throw error;
        }
      );
    }
    return this.value;
  }
}

/** Letters Nunito draws: its latin, latin-ext, cyrillic and vietnamese files. */
const NUNITO_LETTER = /[\p{scx=Latin}\p{scx=Cyrillic}]/u;
/** Letters the CJK font adds. It carries Greek and Cyrillic too, but no Hebrew or Thai. */
const CJK_LETTER =
  /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Bopomofo}\p{scx=Greek}]/u;

/** Whether the title has a Greek letter, which only the CJK font draws. */
const hasGreek = (title: string): boolean => /\p{scx=Greek}/u.test(title);

/**
 * The title as the loaded fonts can draw it. A letter no font has would come
 * out as nothing at all, so each run of them becomes an ellipsis, and a title
 * made of nothing else (Hebrew, Thai, ...) is the app's name: a picture
 * without a title looks broken, one with the name looks like a link to the
 * poll tool.
 */
export function drawableTitle(
  title: string,
  appName: string,
  cjk: boolean
): string {
  let out = '';
  let lost = false;
  let any = false;
  for (const char of title) {
    const gap = /\p{L}/u.test(char)
      ? !NUNITO_LETTER.test(char) && !(cjk && CJK_LETTER.test(char))
      : lost && /\p{M}/u.test(char);
    if (gap) {
      if (!lost) out += '…';
      lost = true;
      any = true;
    } else {
      out += char;
      lost = false;
    }
  }
  return any && !/[\p{L}\p{N}]/u.test(out) ? appName : out;
}

/** Renders per second the renderer sustains, and how many it does in a burst. */
export interface RenderBudget {
  burst: number;
  perSecond: number;
}

/** Nunito's files, 400 and 800 each: Latin and the scripts around it. */
const NUNITO_FILES = [
  'latin',
  'latin-ext',
  'vietnamese',
  'cyrillic',
  'cyrillic-ext',
].flatMap((subset) => [`${subset}-400`, `${subset}-800`]);

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
  private readonly latin = new Lazy(() =>
    Promise.all(
      NUNITO_FILES.map(async (name) =>
        decompress(
          await readFile(
            require.resolve(
              `@fontsource/nunito/files/nunito-${name}-normal.woff2`
            )
          )
        )
      )
    )
  );
  /** Noto Sans CJK JP from the built client, or null when there is none. */
  private readonly cjk = new Lazy(() =>
    this.clientFile('fonts/noto-sans-cjk-jp-regular.woff2').then((file) =>
      file ? decompress(file) : null
    )
  );
  private readonly owl = new Lazy(() =>
    this.clientFile('favicon.svg').then((file) =>
      file ? `data:image/svg+xml;base64,${file.toString('base64')}` : null
    )
  );
  /**
   * The newest picture of each event, one slot per event: an older version
   * can never be asked for again, so it must not take a slot from the others.
   */
  private readonly cache = new Map<string, { version: number; png: Buffer }>();
  /** Pictures being drawn, so two requests for one version draw it once. */
  private readonly drawing = new Map<string, Promise<Buffer>>();

  private readonly clientDir: string | null;
  private readonly host: string;
  /** Events whose picture is kept in memory, the least recently used dropped first. */
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
    const { id, version } = data.event;
    const key = `${id}:${version}`;
    const hit = this.cache.get(id);
    if (hit?.version === version) {
      this.cache.delete(id);
      this.cache.set(id, hit);
      return hit.png;
    }
    const pending = this.drawing.get(key);
    if (pending) return pending;
    const wait = this.take();
    if (wait > 0) throw new PreviewBusy(wait);
    const job = this.draw(data).finally(() => this.drawing.delete(key));
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

  private async draw(data: EventSnapshotData): Promise<Buffer> {
    await wasm.get();
    const fonts = [...(await this.latin.get())];
    let cjk = false;
    if (previewNeedsCjk(data) || hasGreek(data.event.title)) {
      const font = await this.cjk.get();
      if (font) {
        fonts.push(font);
        cjk = true;
      }
    }
    const { event } = data;
    const title = drawableTitle(
      event.title,
      SERVER_TEXTS[event.language].appName,
      cjk
    );
    const svg = previewSvg(
      title === event.title ? data : { ...data, event: { ...event, title } },
      { host: this.host, owl: await this.owl.get() }
    );
    const png = rasterise(svg, fonts);
    // Two requests can overlap across a change; the newer picture stays.
    const kept = this.cache.get(event.id);
    if (!kept || kept.version <= event.version) {
      this.cache.delete(event.id);
      this.cache.set(event.id, { version: event.version, png });
      if (this.cache.size > this.cacheSize)
        this.cache.delete(this.cache.keys().next().value!);
    }
    return png;
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
const wasm = new Lazy(async () =>
  initWasm(await readFile(require.resolve('@resvg/resvg-wasm/index_bg.wasm')))
);
