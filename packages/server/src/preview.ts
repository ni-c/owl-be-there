import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import {
  APP_NAME,
  isRtl,
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

/** Whether the title has a Greek letter, which only the CJK font draws. */
const hasGreek = (title: string): boolean => /\p{scx=Greek}/u.test(title);
const hasArabic = (title: string): boolean => /\p{scx=Arabic}/u.test(title);

/** Whether a loaded font has a glyph for a code point. */
export type Covers = (code: number) => boolean;

/**
 * The code points a TrueType font maps to a glyph, from its `cmap` (formats 4
 * and 12, the Unicode subtables). Unreadable or truncated data gives what was
 * read so far.
 */
function cmapOf(font: Uint8Array): Set<number> {
  const covered = new Set<number>();
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  try {
    let table = -1;
    for (let i = 0, n = view.getUint16(4); i < n; i += 1)
      if (view.getUint32(12 + i * 16) === 0x636d6170)
        table = view.getUint32(12 + i * 16 + 8);
    if (table < 0) return covered;
    for (let i = 0, n = view.getUint16(table + 2); i < n; i += 1) {
      const platform = view.getUint16(table + 4 + i * 8);
      const encoding = view.getUint16(table + 6 + i * 8);
      if (
        platform !== 0 &&
        !(platform === 3 && (encoding === 1 || encoding === 10))
      )
        continue;
      const sub = table + view.getUint32(table + 8 + i * 8);
      const format = view.getUint16(sub);
      if (format === 12) {
        for (let g = 0, n12 = view.getUint32(sub + 12); g < n12; g += 1) {
          const at = sub + 16 + g * 12;
          const start = view.getUint32(at);
          const glyph = view.getUint32(at + 8);
          for (let c = start; c <= view.getUint32(at + 4); c += 1)
            if (glyph + c - start !== 0) covered.add(c);
        }
      } else if (format === 4) {
        const count = view.getUint16(sub + 6) / 2;
        const ends = sub + 14;
        const starts = ends + count * 2 + 2;
        const deltas = starts + count * 2;
        const offsets = deltas + count * 2;
        for (let seg = 0; seg < count; seg += 1) {
          const start = view.getUint16(starts + seg * 2);
          const delta = view.getUint16(deltas + seg * 2);
          const offset = view.getUint16(offsets + seg * 2);
          for (let c = start; c <= view.getUint16(ends + seg * 2); c += 1) {
            if (c === 0xffff) break;
            let glyph =
              offset === 0
                ? c
                : view.getUint16(offsets + seg * 2 + offset + (c - start) * 2);
            if (offset !== 0 && glyph === 0) continue;
            glyph = (glyph + delta) & 0xffff;
            if (glyph !== 0) covered.add(c);
          }
        }
      }
    }
  } catch {
    // A font cut short: the glyphs read so far still count.
  }
  return covered;
}

const coverage = new WeakMap<Uint8Array, Set<number>>();

/** What the given fonts draw between them; each font is read once. */
export function coverageOf(fonts: readonly Uint8Array[]): Covers {
  const sets = fonts.map((font) => {
    let set = coverage.get(font);
    if (!set) coverage.set(font, (set = cmapOf(font)));
    return set;
  });
  return (code) => sets.some((set) => set.has(code));
}

/** Joiners, variation selectors and tags: invisible, and no glyph in any font. */
const JOINER = /[\u200B-\u200D\u2060]/u;
const SELECTOR = /[\uFE00-\uFE0F\u{E0000}-\u{E007F}]/u;

/**
 * The title as the loaded fonts can draw it. A character no font has comes out
 * as a hollow box: symbols and emoji are left out, each run of letters is
 * replaced by an ellipsis, and a title left without a letter or a digit
 * (Hebrew, Thai, an emoji ...) is the app's name: a picture without a title
 * looks broken, one with the name looks like a link to the poll tool.
 */
export function drawableTitle(
  title: string,
  appName: string,
  covers: Covers
): string {
  let out = '';
  let lost = false;
  let any = false;
  // The last character was dropped; joiners it leaves behind go with it.
  let dropped = false;
  for (const char of title.normalize('NFC')) {
    const code = char.codePointAt(0)!;
    if (SELECTOR.test(char) || (JOINER.test(char) && dropped)) {
      continue;
    }
    if (/\p{White_Space}/u.test(char)) {
      out += covers(code) ? char : ' ';
      lost = false;
      dropped = false;
      continue;
    }
    // Controls and format characters (bidi marks, the Persian half-space)
    // have no glyph to draw or lose.
    let shown = char;
    if (!covers(code)) {
      // A letter with an accent the font lacks as one glyph, drawn as two.
      const parts = char.normalize('NFD');
      if (
        [...parts].length > 1 &&
        [...parts].every((c) => covers(c.codePointAt(0)!))
      )
        shown = parts;
    }
    const keep = shown !== char || covers(code) || /\p{Cf}/u.test(char);
    // A joiner in front of a dropped character goes with it.
    if (!keep || (lost && /\p{M}/u.test(char)))
      out = out.replace(/[\u200B-\u200D\u2060]+$/u, '');
    if (!keep && /\p{L}/u.test(char)) {
      if (!lost) out += '…';
      lost = true;
      any = true;
      dropped = true;
    } else if (!keep || (lost && /\p{M}/u.test(char))) {
      any = true;
      dropped = true;
    } else {
      out += shown;
      lost = false;
      dropped = false;
    }
  }
  return any && !/[\p{L}\p{N}]/u.test(out) ? appName : out;
}

/** Renders per second the renderer sustains, and how many it does in a burst. */
export interface RenderBudget {
  burst: number;
  perSecond: number;
}

/**
 * Nunito at 400 and 800: the Latin, Vietnamese and Cyrillic subsets of
 * @fontsource/nunito merged into one file per weight. resvg takes a missing
 * glyph from the first font that has it, whatever its weight, and gives up on
 * a line that font shapes into a different number of glyphs; with one file per
 * subset, Vietnamese came out as boxes and bold Cyrillic as regular.
 */
const NUNITO_FILES = ['nunito-400.woff2', 'nunito-800.woff2'].map((name) =>
  fileURLToPath(new URL(`../fonts/${name}`, import.meta.url))
);

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
      NUNITO_FILES.map(async (path) => decompress(await readFile(path)))
    )
  );
  /** Noto Sans CJK JP from the built client, or null when there is none. */
  private readonly cjk = new Lazy(() =>
    this.clientFile('fonts/noto-sans-cjk-jp-regular-v2.woff2').then((file) =>
      file ? decompress(file) : null
    )
  );
  private readonly cjkSc = new Lazy(() =>
    this.clientFile('fonts/noto-sans-cjk-sc-regular-v2.woff2').then((file) =>
      file ? decompress(file) : null
    )
  );
  private readonly arabic = new Lazy(async () => {
    const files = await Promise.all([
      this.clientFile('fonts/owl-noto-sans-arabic-regular-v2.woff2'),
      this.clientFile('fonts/owl-noto-sans-arabic-bold-v2.woff2'),
    ]);
    if (files.some((file) => file === null)) return null;
    return Promise.all(files.map((file) => decompress(file!)));
  });
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
    if (previewNeedsCjk(data) || hasGreek(data.event.title)) {
      const font = await (data.event.language === 'zh-Hans'
        ? this.cjkSc.get()
        : this.cjk.get());
      if (font) fonts.push(font);
    }
    if (isRtl(data.event.language) || hasArabic(data.event.title)) {
      const loaded = await this.arabic.get();
      if (loaded) fonts.push(...loaded);
    }
    const { event } = data;
    const title = drawableTitle(event.title, APP_NAME, coverageOf(fonts));
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
