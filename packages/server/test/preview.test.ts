import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  isRtl,
  LANGUAGES,
  LOCALES,
  previewSvg,
  SERVER_TEXTS,
} from '@owl/shared';
import { Resvg } from '@resvg/resvg-wasm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { migrate } from '../src/db/migrations.js';
import { snapshot } from '../src/db/repo.js';
import { Db } from '../src/db/sqlite.js';
import {
  coverageOf,
  drawableTitle,
  PreviewBusy,
  PreviewRenderer,
  type Covers,
} from '../src/preview.js';
import {
  CLIENT_DIR,
  createEvent,
  join,
  mark,
  testApp,
  WEEKEND,
  type TestApp,
} from './helpers.js';

let t: TestApp | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await t?.app.close();
  t = undefined;
});

/** The built client's public files, with the CJK font the test fixture lacks. */
const REAL_CLIENT = fileURLToPath(
  new URL('../../client/public', import.meta.url)
);

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Written as escapes: some of these are invisible or combine with their neighbour.
const PARTY_POPPER = '\u{1F389}';
const CAKE = '\u{1F382}';
const FLAG_DE = '\u{1F1E9}\u{1F1EA}';
const THUMBS_UP = '\u{1F44D}';
const SKIN_TONE = '\u{1F3FD}';
/** The digit, the emoji variation selector and the combining keycap. */
const KEYCAP_ONE = '1\uFE0F\u20E3';
/** Emoji no font has, not even the CJK one. */
const PLANE_EMOJI = [PARTY_POPPER, CAKE, FLAG_DE, THUMBS_UP + SKIN_TONE];
/** Symbols only the CJK font draws: sun, football, arrow, star, red heart. */
const NUNITO_LACKS = ['\u2600', '\u26BD', '\u2192', '\u2605', '\u2764\uFE0F'];

/** Width and height from the IHDR chunk. */
const sizeOf = (png: Buffer): [number, number] => [
  png.readUInt32BE(16),
  png.readUInt32BE(20),
];

/**
 * The rightmost column of dark title ink in a picture. The title is drawn
 * before the calendar panel at x=696, so a line wider than the column shows as
 * ink running up to the panel's edge, cut off there.
 */
const titleInkRight = (pixels: Uint8Array): number => {
  const width = 1200;
  let right = -1;
  for (let y = 150; y < 440; y += 1) {
    for (let x = 72; x < 696; x += 1) {
      const at = (y * width + x) * 4;
      if (pixels[at]! < 90 && pixels[at + 1]! < 90 && pixels[at + 2]! < 90)
        right = Math.max(right, x);
    }
  }
  return right;
};

const versionOf = (
  data: NonNullable<ReturnType<typeof snapshot>>,
  version: number
) => ({ ...data, event: { ...data.event, version } });

describe('drawing a picture', () => {
  it('frees the renderer and the image, and still returns the whole PNG', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    const data = snapshot(t.db, id)!;
    const freed: string[] = [];
    const render = Resvg.prototype.render;
    vi.spyOn(Resvg.prototype, 'render').mockImplementation(function (
      this: InstanceType<typeof Resvg>
    ) {
      const image = render.call(this);
      const free = image.free.bind(image);
      image.free = () => {
        freed.push('image');
        free();
      };
      return image;
    });
    const free = Resvg.prototype.free;
    vi.spyOn(Resvg.prototype, 'free').mockImplementation(function (
      this: InstanceType<typeof Resvg>
    ) {
      freed.push('renderer');
      free.call(this);
    });
    const renderer = new PreviewRenderer(null, 'owl.example.org');
    const png = await renderer.render(data);
    expect(freed.sort()).toEqual(['image', 'renderer']);
    expect(png.subarray(0, 8)).toEqual(PNG);
    expect(sizeOf(png)).toEqual([1200, 630]);
  });

  it('frees both even when the image cannot be made', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    const data = snapshot(t.db, id)!;
    const free = vi.spyOn(Resvg.prototype, 'free');
    vi.spyOn(Resvg.prototype, 'render').mockImplementation(() => {
      throw new Error('out of memory');
    });
    const renderer = new PreviewRenderer(null, 'owl.example.org');
    await expect(renderer.render(data)).rejects.toThrow('out of memory');
    expect(free).toHaveBeenCalledTimes(1);
    // Nothing is cached for the failure: the next try draws again.
    vi.restoreAllMocks();
    expect((await renderer.render(data)).subarray(0, 8)).toEqual(PNG);
  });

  it('keeps the memory flat over many distinct versions', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    const max = await join(t.app, id, 'Max');
    await mark(t.app, id, max, WEEKEND);
    const data = snapshot(t.db, id)!;
    const renderer = new PreviewRenderer(null, 'owl.example.org', 1, {
      budget: null,
    });
    const first = await renderer.render(data);
    const before = process.memoryUsage().rss;
    let last = first;
    for (let i = 1; i <= 150; i += 1) {
      last = await renderer.render(versionOf(data, data.event.version + i));
    }
    // Unfreed, every picture kept about 3 MB of WebAssembly memory.
    expect(process.memoryUsage().rss - before).toBeLessThan(150 * 1024 * 1024);
    for (const png of [first, last]) {
      expect(png.subarray(0, 8)).toEqual(PNG);
      expect(sizeOf(png)).toEqual([1200, 630]);
    }
  }, 30_000);

  it('draws one version once, however many ask at the same time', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    const data = snapshot(t.db, id)!;
    const spy = vi.spyOn(Resvg.prototype, 'render');
    const renderer = new PreviewRenderer(null, 'owl.example.org', 5, {
      budget: { burst: 1, perSecond: 1 },
    });
    const [a, b, c] = await Promise.all([
      renderer.render(data),
      renderer.render(data),
      renderer.render(data),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });
});

describe('the picture cache', () => {
  const drawn = () => vi.spyOn(Resvg.prototype, 'render');
  const asEvent = (data: ReturnType<typeof versionOf>, id: string) => ({
    ...data,
    event: { ...data.event, id },
  });

  it("keeps one slot per event, so one event's edits evict no other picture", async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    const data = snapshot(t.db, id)!;
    const spy = drawn();
    const renderer = new PreviewRenderer(null, 'owl.example.org', 3, {
      budget: null,
    });
    const first = await renderer.render(data);
    const b = asEvent(data, 'BBBBBBBBBBBB');
    for (let version = 1; version <= 12; version += 1)
      await renderer.render(versionOf(b, version));
    expect(spy).toHaveBeenCalledTimes(13);
    expect(await renderer.render(data)).toBe(first);
    expect(spy).toHaveBeenCalledTimes(13);
  });

  it('replaces the entry of an event when its version changes', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    const data = snapshot(t.db, id)!;
    const spy = drawn();
    const renderer = new PreviewRenderer(null, 'owl.example.org', 1, {
      budget: null,
    });
    const v1 = await renderer.render(versionOf(data, 1));
    const v2 = await renderer.render(versionOf(data, 2));
    expect(await renderer.render(versionOf(data, 2))).toBe(v2);
    expect(spy).toHaveBeenCalledTimes(2);
    // The old version is gone: it is drawn again.
    expect(await renderer.render(versionOf(data, 1))).not.toBe(v1);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('does not let a late older picture replace a newer one', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    const data = snapshot(t.db, id)!;
    const spy = drawn();
    const renderer = new PreviewRenderer(null, 'owl.example.org', 5, {
      budget: null,
    });
    const newer = await renderer.render(versionOf(data, 5));
    await renderer.render(versionOf(data, 4));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await renderer.render(versionOf(data, 5))).toBe(newer);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('drops the least recently used event when it is full', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    const a = snapshot(t.db, id)!;
    const b = asEvent(a, 'BBBBBBBBBBBB');
    const c = asEvent(a, 'CCCCCCCCCCCC');
    const spy = drawn();
    const renderer = new PreviewRenderer(null, 'owl.example.org', 2, {
      budget: null,
    });
    await renderer.render(a);
    await renderer.render(b);
    await renderer.render(a);
    await renderer.render(c);
    expect(spy).toHaveBeenCalledTimes(3);
    // A was used last, so B went; A is still there, B is drawn again.
    await renderer.render(a);
    expect(spy).toHaveBeenCalledTimes(3);
    await renderer.render(b);
    expect(spy).toHaveBeenCalledTimes(4);
  });
});

/** A fresh copy of the renderer module whose first reads or WASM start-up can be made to fail. */
async function flakyRenderer(failing: {
  read?: (path: string) => boolean;
  wasm?: boolean;
}) {
  vi.resetModules();
  const reads: string[] = [];
  vi.doMock('node:fs/promises', async (original) => {
    const real = await original<typeof import('node:fs/promises')>();
    const readFile = (async (path: string, ...rest: unknown[]) => {
      reads.push(path);
      if (failing.read?.(path)) {
        delete failing.read;
        throw Object.assign(new Error('too many open files'), {
          code: 'EMFILE',
        });
      }
      return (real.readFile as (...args: unknown[]) => unknown)(path, ...rest);
    }) as typeof real.readFile;
    return { ...real, readFile };
  });
  // The WebAssembly may be running already, from an earlier test in this file:
  // a second start-up is then a no-op rather than an error.
  vi.doMock('@resvg/resvg-wasm', async (original) => {
    const real = await original<typeof import('@resvg/resvg-wasm')>();
    let failNext = failing.wasm === true;
    return {
      ...real,
      initWasm: async (...args: Parameters<typeof real.initWasm>) => {
        if (failNext) {
          failNext = false;
          throw new Error('start-up failed');
        }
        await real.initWasm(...args).catch(() => undefined);
      },
    };
  });
  const module = await import('../src/preview.js');
  return { PreviewRenderer: module.PreviewRenderer, reads };
}

describe('a failed start', () => {
  afterEach(() => {
    vi.doUnmock('node:fs/promises');
    vi.doUnmock('@resvg/resvg-wasm');
    vi.resetModules();
  });

  it('is not kept: a font that could not be read is read again', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    const data = snapshot(t.db, id)!;
    const { PreviewRenderer: Renderer, reads } = await flakyRenderer({
      read: (path) => path.includes('nunito-400'),
    });
    const renderer = new Renderer(null, 'owl.example.org', 5, { budget: null });
    await expect(renderer.render(data)).rejects.toThrow('too many open files');
    const png = await renderer.render(data);
    expect(png.subarray(0, 8)).toEqual(PNG);
    expect(reads.filter((p) => p.includes('nunito-400'))).toHaveLength(2);
  });

  it('is not kept: the WebAssembly starts again, in a new renderer too', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    const data = snapshot(t.db, id)!;
    const { PreviewRenderer: Renderer } = await flakyRenderer({ wasm: true });
    const first = new Renderer(null, 'owl.example.org', 5, { budget: null });
    await expect(first.render(data)).rejects.toThrow('start-up failed');
    const second = new Renderer(null, 'owl.example.org', 5, { budget: null });
    expect((await second.render(data)).subarray(0, 8)).toEqual(PNG);
  });

  it('is not kept for the CJK font either: a missing file is looked for again', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app, { title: '忘年会' });
    const data = snapshot(t.db, id)!;
    const { PreviewRenderer: Renderer, reads } = await flakyRenderer({
      read: (path) => path.includes('noto-sans-cjk-jp-regular-v2'),
    });
    const renderer = new Renderer(REAL_CLIENT, 'owl.example.org', 5, {
      budget: null,
    });
    // The first read fails and the picture is drawn without the font; the next
    // version asks again and gets it.
    const without = await renderer.render(versionOf(data, 1));
    const withFont = await renderer.render(versionOf(data, 2));
    expect(
      reads.filter((p) => p.includes('noto-sans-cjk-jp-regular-v2'))
    ).toHaveLength(2);
    expect(withFont.equals(without)).toBe(false);
  }, 30_000);
});

describe('titles in scripts the fonts may not cover', () => {
  const host = 'owl.example.org';
  const pictureOf = async (
    title: string,
    clientDir: string | null = null
  ): Promise<Buffer> => {
    const { id } = await createEvent(t!.app, { title });
    const renderer = new PreviewRenderer(clientDir, host, 5, { budget: null });
    return renderer.render(snapshot(t!.db, id)!);
  };
  /** Several titles through one renderer, so a font is unpacked once. */
  const picturesOf = async (
    titles: string[],
    clientDir: string | null
  ): Promise<Buffer[]> => {
    const renderer = new PreviewRenderer(clientDir, host, 5, { budget: null });
    const pictures: Buffer[] = [];
    for (const title of titles) {
      const { id } = await createEvent(t!.app, { title });
      pictures.push(await renderer.render(snapshot(t!.db, id)!));
    }
    return pictures;
  };

  it('draws Cyrillic with Nunito: the titles show, and differ', async () => {
    t = await testApp();
    const name = await pictureOf('Owl Be There');
    const a = await pictureOf('Привет');
    const b = await pictureOf('Абвгде');
    const ext = await pictureOf('Ѡѣ Ӂ');
    expect(a.equals(name)).toBe(false);
    expect(a.equals(b)).toBe(false);
    expect(ext.equals(name)).toBe(false);
    expect(ext.equals(a)).toBe(false);
  });

  it('draws Arabic titles with the bundled font', async () => {
    t = await testApp();
    const baseline = await pictureOf('Owl Be There', REAL_CLIENT);
    const arabic = await pictureOf('عشاء الفريق', REAL_CLIENT);
    expect(arabic.subarray(0, 8)).toEqual(PNG);
    expect(arabic.equals(baseline)).toBe(false);
    expect(
      drawableTitle('عشاء الفريق', 'Owl Be There', await fontCovers('arabic'))
    ).toBe('عشاء الفريق');
  });

  it('draws Simplified Chinese titles with the bundled SC font', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app, {
      language: 'zh-Hans',
      title: '团队聚餐',
    });
    const data = snapshot(t.db, id)!;
    const without = await new PreviewRenderer(null, host, 5, {
      budget: null,
    }).render(data);
    const withFont = await new PreviewRenderer(REAL_CLIENT, host, 5, {
      budget: null,
    }).render(data);
    expect(withFont.subarray(0, 8)).toEqual(PNG);
    expect(withFont.equals(without)).toBe(false);
  });

  it('wraps Cyrillic titles to the width it draws them in: nothing runs under the calendar panel', async () => {
    t = await testApp();
    let pixels = new Uint8Array();
    const render = Resvg.prototype.render;
    vi.spyOn(Resvg.prototype, 'render').mockImplementation(function (
      this: InstanceType<typeof Resvg>
    ) {
      const image = render.call(this);
      pixels = image.pixels.slice();
      return image;
    });
    // Wide capitals, wide lowercase, mixed with Latin, and a title of three lines.
    for (const title of [
      'Мышиная ловля: ужин',
      'ТУРНИР ПО ФУТБОЛУ',
      'День рождения Ольги',
      'ДЕНЬ РОЖДЕНИЯ ОЛЬГИ',
      'Ужин у Жени и Миши',
      'Щука, жук и шершень',
      'Party Вечеринка у Юли',
      'Годовщина свадьбы Жени и Юры и вся семья с друзьями приезжайте все',
    ]) {
      await pictureOf(title);
      const right = titleInkRight(pixels);
      // Something was drawn, and within the 590 px column that starts at x=72.
      expect(right, title).toBeGreaterThan(300);
      expect(right, title).toBeLessThan(72 + 590 + 12);
    }
  });

  it('draws Vietnamese letters Latin Extended does not have', async () => {
    t = await testApp();
    const plain = await pictureOf('Tiec');
    const accents = await pictureOf('Tiệc ạ');
    expect(accents.equals(plain)).toBe(false);
    expect(accents.equals(await pictureOf('Owl Be There'))).toBe(false);
  });

  it('puts the app name where Hebrew and Thai leave nothing to draw', async () => {
    t = await testApp();
    const name = await pictureOf('Owl Be There');
    expect((await pictureOf('שלוםחב')).equals(name)).toBe(true);
    expect((await pictureOf('กขคงจฉ')).equals(name)).toBe(true);
    // Greek is the CJK font's; without it, it is the same fallback.
    expect((await pictureOf('Γειάσο')).equals(name)).toBe(true);
  });

  it('draws Greek when the CJK font is there', async () => {
    t = await testApp();
    const name = await pictureOf('Owl Be There', REAL_CLIENT);
    const a = await pictureOf('Γειάσο', REAL_CLIENT);
    const b = await pictureOf('Αβγδεζ', REAL_CLIENT);
    expect(a.equals(name)).toBe(false);
    expect(a.equals(b)).toBe(false);
  }, 30_000);

  it('keeps what can be drawn of a mixed title and marks what cannot', async () => {
    t = await testApp();
    const mixed = await pictureOf('Привет שלום');
    expect(mixed.equals(await pictureOf('Привет …'))).toBe(true);
    expect(mixed.equals(await pictureOf('Owl Be There'))).toBe(false);
  });

  it('leaves emoji and symbols out instead of drawing a hollow box for each', async () => {
    t = await testApp();
    const party = await pictureOf('Party');
    // Nunito has none of these: the picture is that of the title without them.
    for (const symbol of [
      ...PLANE_EMOJI,
      ...NUNITO_LACKS,
      `${PARTY_POPPER}${CAKE}`,
      `${PARTY_POPPER} ${CAKE}`,
    ])
      expect(
        (await pictureOf(`Party ${symbol}`)).equals(party),
        JSON.stringify(symbol)
      ).toBe(true);
    // The invisible selector of a keycap stays; the digit is the title's.
    expect(
      (await pictureOf(`Party ${KEYCAP_ONE}`)).equals(
        await pictureOf('Party 1')
      )
    ).toBe(true);
    // What Nunito does have is still drawn.
    for (const drawn of ['\u00A9', '\u00AE', '\u2122', '\u2212'])
      expect(
        (await pictureOf(`Party ${drawn}`)).equals(party),
        JSON.stringify(drawn)
      ).toBe(false);
  });

  it('puts the app name where an emoji is all there is, and keeps the digits next to one', async () => {
    t = await testApp();
    const name = await pictureOf('Owl Be There');
    for (const title of [
      ...PLANE_EMOJI,
      ...NUNITO_LACKS,
      `${PARTY_POPPER} ${CAKE}`,
      SKIN_TONE,
    ])
      expect((await pictureOf(title)).equals(name), JSON.stringify(title)).toBe(
        true
      );
    const year = await pictureOf('2027');
    expect((await pictureOf(`${PARTY_POPPER} 2027`)).equals(year)).toBe(true);
    expect(year.equals(name)).toBe(false);
    // Punctuation alone is no emoji: it stays.
    expect((await pictureOf('!?')).equals(name)).toBe(false);
  });

  it('draws the symbols the CJK font has and still drops the emoji it has not', async () => {
    t = await testApp();
    const drawnByCjk = [
      '\u2605',
      '\u2665',
      '\u2192',
      '\u2713',
      '\u2600',
      '\u26BD',
    ];
    // The NEW and the free-of-charge buttons are squared letters it draws.
    const squared = ['\u{1F195}', '\u{1F21A}'];
    const [base, ...rest] = await picturesOf(
      [
        '忘年会',
        ...[...drawnByCjk, ...squared].map((symbol) => `忘年会 ${symbol}`),
        ...PLANE_EMOJI.map((emoji) => `忘年会 ${emoji}`),
      ],
      REAL_CLIENT
    );
    const kept = rest.slice(0, drawnByCjk.length + squared.length);
    const dropped = rest.slice(kept.length);
    expect(dropped).toHaveLength(PLANE_EMOJI.length);
    for (const picture of kept) expect(picture.equals(base!)).toBe(false);
    // Each is a glyph of its own, not the one box all of them would share.
    const distinct = new Set(kept.map((picture) => picture.toString('base64')));
    expect(distinct.size).toBe(kept.length);
    for (const picture of dropped) expect(picture.equals(base!)).toBe(true);
  }, 30_000);
});

/** The fonts a picture loads, unpacked the way the renderer does. */
const FONT_FILES = {
  latin: ['../fonts/nunito-400.woff2', '../fonts/nunito-800.woff2'],
  cjk: ['../../client/public/fonts/noto-sans-cjk-jp-regular-v2.woff2'],
  arabic: [
    '../../client/public/fonts/owl-noto-sans-arabic-regular-v2.woff2',
    '../../client/public/fonts/owl-noto-sans-arabic-bold-v2.woff2',
  ],
} as const;

async function fontBytes(kind: keyof typeof FONT_FILES): Promise<Uint8Array[]> {
  const wawoff2 = createRequire(import.meta.url)('wawoff2') as {
    decompress(woff2: Uint8Array): Promise<Uint8Array>;
  };
  return Promise.all(
    FONT_FILES[kind].map(async (path) =>
      (
        await wawoff2.decompress(await readFile(new URL(path, import.meta.url)))
      ).slice()
    )
  );
}

/** What Nunito and the named other fonts draw between them. */
async function fontCovers(
  ...kinds: (keyof typeof FONT_FILES)[]
): Promise<Covers> {
  const fonts = await fontBytes('latin');
  for (const kind of kinds)
    if (kind !== 'latin') fonts.push(...(await fontBytes(kind)));
  return coverageOf(fonts);
}

describe('coverageOf', () => {
  it('agrees with an independent read of each font', async () => {
    for (const kind of ['latin', 'cjk', 'arabic'] as const) {
      const fonts = await fontBytes(kind);
      const covers = coverageOf(fonts);
      const expected = new Set(fonts.flatMap((f) => [...mappedCodePoints(f)]));
      expect(expected.size, kind).toBeGreaterThan(100);
      for (const code of expected)
        expect(covers(code), `${kind} ${code}`).toBe(true);
    }
  });

  it('answers false for what no font has, and for nothing at all', async () => {
    const latin = coverageOf(await fontBytes('latin'));
    expect(latin('a'.codePointAt(0)!)).toBe(true);
    expect(latin(0x1f389)).toBe(false);
    expect(latin(0x05d0)).toBe(false);
    expect(latin(0x2605)).toBe(false);
    expect(latin(0x10ffff)).toBe(false);
    expect(coverageOf([])('a'.codePointAt(0)!)).toBe(false);
    // Bytes that are no font: nothing mapped, nothing thrown.
    expect(coverageOf([new Uint8Array(0)])(65)).toBe(false);
    expect(coverageOf([new Uint8Array(40)])(65)).toBe(false);
    // Reading the same font again gives the same answers.
    const fonts = await fontBytes('arabic');
    expect(coverageOf(fonts)(0x627)).toBe(coverageOf(fonts)(0x627));
  });

  it('confirms what the Arabic font lacks, and what the CJK font adds', async () => {
    const arabic = coverageOf(await fontBytes('arabic'));
    for (const char of '()+?…–—§·')
      expect(arabic(char.codePointAt(0)!), char).toBe(false);
    for (const char of '-،:.0٠ ')
      expect(arabic(char.codePointAt(0)!), char).toBe(true);
    const cjk = coverageOf(await fontBytes('cjk'));
    for (const char of '★♥→αΩ忘안')
      expect(cjk(char.codePointAt(0)!), char).toBe(true);
    // The red heart and the sparkles are not in the CJK font.
    for (const char of '\u2764\u2728')
      expect(cjk(char.codePointAt(0)!), char).toBe(false);
  });
});

describe('drawableTitle', () => {
  const app = 'Owl Be There';
  let latin: Covers;
  let withCjk: Covers;
  let withArabic: Covers;
  beforeAll(async () => {
    latin = await fontCovers();
    withCjk = await fontCovers('cjk');
    withArabic = await fontCovers('arabic');
  });
  const drawn = (title: string, cjk = false) =>
    drawableTitle(title, app, cjk ? withCjk : latin);

  it('leaves titles of covered scripts, digits and punctuation alone', () => {
    for (const title of [
      '',
      ' ',
      'Grillabend Ü',
      'Привет 2026!',
      'Tiệc ạ',
      '2026',
      '…',
      '!?',
      // Nunito draws the copyright sign, the trademark sign, the minus sign
      // and the division slash.
      '© 2026 ™',
      '®',
      'A−B',
      'A∕B',
    ])
      expect(drawn(title), title).toBe(title);
    expect(drawn('© 2026 ™', true)).toBe('© 2026 ™');
  });

  it('leaves emoji and symbols out, and nothing else', () => {
    for (const [title, expected] of [
      [`Party ${PARTY_POPPER}`, 'Party '],
      [`${CAKE} Sarahs birthday`, ' Sarahs birthday'],
      ['☀ Grillen', ' Grillen'],
      ['⚽ Turnier', ' Turnier'],
      ['A → B', 'A  B'],
      ['★ 2027 ♥', ' 2027 '],
      [`${FLAG_DE} Fest`, ' Fest'],
      [`${THUMBS_UP}${SKIN_TONE} ok`, ' ok'],
      // The variation selector and the keycap go with the emoji they belong to.
      [`${KEYCAP_ONE} Platz`, '1 Platz'],
      ['\u2764\uFE0F Liebe', ' Liebe'],
    ] as const)
      expect(drawn(title), title).toBe(expected);
  });

  it('takes the app name when an emoji was all there was', () => {
    for (const title of [
      PARTY_POPPER,
      `${PARTY_POPPER} ${CAKE}`,
      `${PARTY_POPPER}${CAKE}`,
      FLAG_DE,
      SKIN_TONE,
      ...NUNITO_LACKS,
      `${PARTY_POPPER}!?`,
    ])
      expect(drawn(title), title).toBe(app);
    // A digit is still something to show, like next to Hebrew.
    expect(drawn(`${PARTY_POPPER} 2027`)).toBe(' 2027');
    expect(drawn(`2027${PARTY_POPPER}`)).toBe('2027');
    expect(drawn(`${PARTY_POPPER} 2027`, true)).toBe(' 2027');
  });

  it('keeps one ellipsis for a run of lost letters that an emoji interrupts', () => {
    expect(drawn(`Hi שלום${PARTY_POPPER}שלום`)).toBe('Hi …');
    expect(drawn(`Hi שלום ${PARTY_POPPER} Hi`)).toBe('Hi …  Hi');
  });

  it('keeps the symbols the CJK font draws, and drops the emoji nothing draws', () => {
    // Star, heart, arrow, check mark, sun, football.
    const symbols = '★ ♥ → ✓ ☀ ⚽';
    expect(drawn(symbols, true)).toBe(symbols);
    expect(drawn(symbols)).toBe(app);
    // The squared NEW and free-of-charge buttons.
    const squared = '\u{1F195} \u{1F21A}';
    expect(drawn(squared, true)).toBe(squared);
    expect(drawn(squared)).toBe(app);
    // Not these: flags, skin tones, keycaps and the emoji planes.
    expect(drawn(`忘年会 ${PARTY_POPPER}`, true)).toBe('忘年会 ');
    expect(drawn(`忘年会${FLAG_DE}`, true)).toBe('忘年会');
    expect(drawn(`${THUMBS_UP}${SKIN_TONE} 忘年会`, true)).toBe(' 忘年会');
    expect(drawn(KEYCAP_ONE, true)).toBe('1');
    expect(drawn(PARTY_POPPER, true)).toBe(app);
    expect(drawn(SKIN_TONE, true)).toBe(app);
  });

  it('replaces each run of letters no font has by one ellipsis', () => {
    expect(drawn('Hello שלום')).toBe('Hello …');
    expect(drawn('שלום Hello wörld ไทย')).toBe('… Hello wörld …');
    expect(drawn('a שלום b')).toBe('a … b');
    expect(drawn('Dinner 2026 שלום')).toBe('Dinner 2026 …');
  });

  it('takes the app name when nothing readable is left', () => {
    expect(drawn('שלוםחב')).toBe(app);
    expect(drawn('กขคงจฉ')).toBe(app);
    expect(drawn('שלום!?')).toBe(app);
    expect(drawn('Γειάσο')).toBe(app);
    // A digit is still something to show.
    expect(drawn('שלום 2026')).toBe('… 2026');
  });

  it('draws an accented letter the font lacks as base and accent', () => {
    // The CJK font has alpha and the combining acute, but not alpha with tonos.
    expect(drawn('ά', true)).toBe('\u03B1\u0301');
    expect(drawn('Έ ά', true)).toBe('Ε\u0301 α\u0301');
    expect(drawn('ά')).toBe(app);
    // Nunito has these as one glyph: left alone, in either form.
    expect(drawn('é')).toBe('é');
    expect(drawn('e\u0301')).toBe('é');
  });

  it('drops invisible leftovers of emoji, and keeps the Persian half-space', () => {
    const zwj = '\u200D';
    expect(drawn(`a ${PARTY_POPPER}${zwj}${CAKE}${zwj} b`)).toBe('a  b');
    expect(drawn(`a\uFE0F b\uFE0E`)).toBe('a b');
    expect(drawn('a \u{E0067}\u{E007F} b')).toBe('a  b');
    expect(drawn(`${PARTY_POPPER}${zwj}${PARTY_POPPER}`)).toBe(app);
    expect(drawn(`2027${zwj}${PARTY_POPPER}${zwj}`)).toBe('2027');
    // A joiner between letters stays, as does the half-space of Persian.
    expect(drawn(`a${zwj}b`)).toBe(`a${zwj}b`);
    expect(drawableTitle('می\u200Cخواهم', app, withArabic)).toBe(
      'می\u200Cخواهم'
    );
  });

  it('draws what the fonts have and drops what they lack, whatever the Unicode range', () => {
    // Letters of no font, punctuation of no font, a control character.
    expect(drawn('a\u0007b')).toBe('ab');
    expect(drawn('a \u2E2E b')).toBe('a  b');
    expect(drawn('\u00B6\u2E2E')).toBe(app);
    // The CJK font has the ideographic comma; Nunito has not.
    expect(drawn('a、b')).toBe('ab');
    expect(drawn('a、b', true)).toBe('a、b');
    // The red heart and the sparkles box in the CJK font: dropped.
    expect(drawn('忘年会 \u2764\uFE0F\u2728', true)).toBe('忘年会 ');
  });

  it('draws Arabic only with the Arabic font, and leaves its parentheses to arabicPunctuation', () => {
    expect(drawableTitle('عشاء الفريق', app, latin)).toBe(app);
    expect(drawableTitle('عشاء الفريق ٢٠٢٦', app, withArabic)).toBe(
      'عشاء الفريق ٢٠٢٦'
    );
    expect(drawableTitle('Hi عشاء', app, latin)).toBe('Hi …');
  });

  it('leaves no glyph the Arabic font lacks in any line of an Arabic picture', async () => {
    // A line with Arabic letters is drawn by that font alone: one glyph it
    // lacks turns the whole line into boxes.
    const covers = coverageOf(await fontBytes('arabic'));
    const days = Array.from({ length: 10 }, (_, i) => `2026-11-${10 + i}`);
    const lines: string[] = [];
    for (const answers of [0, 1, 2, 3, 10, 11, 100]) {
      const data = {
        event: {
          id: 'AAAAAAAAAAAA',
          title: 'عشاء (الفريق)؟ …',
          description: null,
          language: 'ar',
          status: 'open',
          finalStart: null,
          finalEnd: null,
          days,
          version: 1,
        },
        participants: Array.from({ length: answers }, (_, i) => ({
          id: `p${i}`,
          name: `n${i}`,
          days: {},
          answered: true,
        })),
      } as unknown as Parameters<typeof previewSvg>[0];
      const svg = previewSvg(data, { host: 'owlbethere.app', owl: null });
      for (const m of svg.matchAll(/<text [^>]*>([^<]*)</gu))
        lines.push(m[1]!.replaceAll('&amp;', '&'));
    }
    const arabic = lines.filter((line) => /\p{scx=Arabic}/u.test(line));
    expect(arabic.length).toBeGreaterThan(20);
    for (const line of arabic)
      for (const char of line)
        expect(
          covers(char.codePointAt(0)!) || /\s/u.test(char),
          `${line} ${char}`
        ).toBe(true);
  });

  it('counts the marks that follow a lost letter as lost', () => {
    expect(drawn('שָׁלוֹם')).toBe(app);
    expect(drawn('Hello שָׁלוֹם')).toBe('Hello …');
  });

  it("draws the CJK font's scripts only when the font is loaded", () => {
    expect(drawn('忘年会')).toBe(app);
    expect(drawn('忘年会', true)).toBe('忘年会');
    expect(drawn('안녕 Γειά ー', true)).toBe('안녕 Γει\u03B1\u0301 ー');
    expect(drawn('Γεια ー', true)).toBe('Γεια ー');
    expect(drawn('Привет 日本', true)).toBe('Привет 日本');
    // The CJK font has no Hebrew either.
    expect(drawn('שלום 日本', true)).toBe('… 日本');
  });
});

describe('the budget for new pictures', () => {
  it('refuses a new picture once the burst is spent and says when to return', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    const data = snapshot(t.db, id)!;
    let now = 1_000_000;
    const renderer = new PreviewRenderer(null, 'owl.example.org', 10, {
      budget: { burst: 2, perSecond: 1 },
      now: () => now,
    });
    await renderer.render(versionOf(data, 1));
    await renderer.render(versionOf(data, 2));
    const refused = await renderer
      .render(versionOf(data, 3))
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(PreviewBusy);
    expect((refused as PreviewBusy).retryAfter).toBe(1);
    // Still refused a moment before the next token, served right after it.
    now += 900;
    await expect(renderer.render(versionOf(data, 3))).rejects.toBeInstanceOf(
      PreviewBusy
    );
    now += 100;
    expect((await renderer.render(versionOf(data, 3))).subarray(0, 8)).toEqual(
      PNG
    );
  });

  it('charges nothing for a picture already drawn', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    const data = snapshot(t.db, id)!;
    const renderer = new PreviewRenderer(null, 'owl.example.org', 10, {
      budget: { burst: 1, perSecond: 0.001 },
      now: () => 0,
    });
    const first = await renderer.render(data);
    for (let i = 0; i < 20; i += 1) {
      expect(await renderer.render(data)).toBe(first);
    }
    await expect(renderer.render(versionOf(data, 99))).rejects.toBeInstanceOf(
      PreviewBusy
    );
  });

  it('refills no more than the burst after a long pause', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    const data = snapshot(t.db, id)!;
    let now = 0;
    const renderer = new PreviewRenderer(null, 'owl.example.org', 10, {
      budget: { burst: 2, perSecond: 5 },
      now: () => now,
    });
    now = 3_600_000;
    await renderer.render(versionOf(data, 1));
    await renderer.render(versionOf(data, 2));
    await expect(renderer.render(versionOf(data, 3))).rejects.toBeInstanceOf(
      PreviewBusy
    );
    // A clock that steps back neither refills nor breaks the bucket.
    now = 0;
    await expect(renderer.render(versionOf(data, 3))).rejects.toBeInstanceOf(
      PreviewBusy
    );
  });

  it('answers 503 with Retry-After on the route; pictures already drawn are still served', async () => {
    const config = loadConfig({
      PUBLIC_URL: 'https://owl.example.org',
      LOG_LEVEL: 'silent',
      RATE_LIMIT_MULTIPLIER: '1000',
      CLIENT_DIR,
    });
    const db = new Db(':memory:');
    migrate(db);
    const app = await buildApp({
      config,
      db,
      secret: Buffer.alloc(32, 7),
      previewBudget: { burst: 2, perSecond: 0.001 },
    });
    t = { app, db, config } as TestApp;
    const { id } = await createEvent(app);
    const max = await join(app, id, 'Max');
    const get = (url = `/e/${id}/og.png`) => app.inject({ method: 'GET', url });
    const drawn = await get();
    expect(drawn.statusCode).toBe(200);
    expect((await mark(app, id, max, WEEKEND)).statusCode).toBe(200);
    expect((await get()).statusCode).toBe(200);
    // The third version is not drawn: the budget is spent.
    expect((await mark(app, id, max, [], [], 1)).statusCode).toBe(200);
    const busy = await get();
    expect(busy.statusCode).toBe(503);
    expect(Number(busy.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(busy.json().error).toBe('busy');
    expect(busy.headers['x-robots-tag']).toBe('noindex, nofollow');
    // An unknown event is a 404 and costs no budget; a page costs none either.
    expect((await get('/e/AAAAAAAAAAAA/og.png')).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/e/${id}` })).statusCode
    ).toBe(200);
    // The same version stays refused until the budget refills.
    expect((await get()).statusCode).toBe(503);
  });
});

/** The code points a TrueType font maps to a glyph, from its format 4 and 12 cmaps. */
function mappedCodePoints(font: Uint8Array): Set<number> {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  let cmap = 0;
  for (let index = 0; index < view.getUint16(4); index += 1) {
    const record = 12 + index * 16;
    if (String.fromCharCode(...font.subarray(record, record + 4)) === 'cmap')
      cmap = view.getUint32(record + 8);
  }
  const points = new Set<number>();
  for (let index = 0; index < view.getUint16(cmap + 2); index += 1) {
    const table = cmap + view.getUint32(cmap + 8 + index * 8);
    const format = view.getUint16(table);
    if (format === 12) {
      for (let group = 0; group < view.getUint32(table + 12); group += 1) {
        const start = view.getUint32(table + 16 + group * 12);
        const end = view.getUint32(table + 20 + group * 12);
        for (let code = start; code <= end; code += 1) points.add(code);
      }
    } else if (format === 4) {
      const segments = view.getUint16(table + 6) / 2;
      const ends = table + 14;
      const starts = ends + segments * 2 + 2;
      const deltas = starts + segments * 2;
      const offsets = deltas + segments * 2;
      for (let segment = 0; segment < segments; segment += 1) {
        const start = view.getUint16(starts + segment * 2);
        const end = view.getUint16(ends + segment * 2);
        const delta = view.getUint16(deltas + segment * 2);
        const offset = view.getUint16(offsets + segment * 2);
        for (let code = start; code <= end && code !== 0xffff; code += 1) {
          const glyph =
            offset === 0
              ? (code + delta) & 0xffff
              : view.getUint16(
                  offsets + segment * 2 + offset + (code - start) * 2
                );
          if (glyph !== 0) points.add(code);
        }
      }
    }
  }
  return points;
}

describe('the merged Nunito files', () => {
  it('draw every letter the Latin, Cyrillic and Vietnamese previews use, in both weights', async () => {
    const wawoff2 = createRequire(import.meta.url)('wawoff2') as {
      decompress(woff2: Uint8Array): Promise<Uint8Array>;
    };
    const fonts: Set<number>[] = [];
    for (const weight of [400, 800]) {
      const woff2 = await readFile(
        new URL(`../fonts/nunito-${weight}.woff2`, import.meta.url)
      );
      fonts.push(mappedCodePoints((await wawoff2.decompress(woff2)).slice()));
    }
    const needed = new Set<string>();
    const add = (text: string) => {
      for (const char of text) if (!/\s/u.test(char)) needed.add(char);
    };
    // Arabic-script languages draw with Noto Sans Arabic, CJK with Noto Sans CJK.
    const own = LANGUAGES.filter(
      (language) =>
        !isRtl(language) &&
        !['ja', 'ko', 'zh-Hans', 'zh-Hant'].includes(language)
    );
    for (const language of own) {
      for (const value of Object.values(SERVER_TEXTS[language]))
        if (typeof value === 'string') add(value);
        else
          for (const count of [0, 1, 2, 5, 21, 22])
            add((value as (count: number) => string)(count));
      const months = new Intl.DateTimeFormat(LOCALES[language], {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
      for (let month = 0; month < 12; month += 1)
        add(months.formatRange(Date.UTC(2026, month), Date.UTC(2027, month)));
    }
    // Every letter of the scripts, too, for titles: Latin-1, Latin Extended-A,
    // the Vietnamese letters and Russian and Ukrainian Cyrillic. Not letters:
    // × and ÷; not in Nunito, and archaic: the ij ligature and the long s.
    const skipped = [0xd7, 0xf7, 0x132, 0x133, 0x17f];
    for (const [from, to] of [
      [0xc0, 0x17f],
      [0x1ea0, 0x1ef9],
      [0x400, 0x45f],
    ] as const)
      for (let code = from; code <= to; code += 1)
        if (!skipped.includes(code)) add(String.fromCodePoint(code));
    for (const font of fonts)
      expect(
        [...needed].filter((char) => !font.has(char.codePointAt(0)!))
      ).toEqual([]);
    expect([...fonts[0]!].sort()).toEqual([...fonts[1]!].sort());
  });
});
