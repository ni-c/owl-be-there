import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-wasm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { migrate } from '../src/db/migrations.js';
import { snapshot } from '../src/db/repo.js';
import { Db } from '../src/db/sqlite.js';
import { drawableTitle, PreviewBusy, PreviewRenderer } from '../src/preview.js';
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

/** Width and height from the IHDR chunk. */
const sizeOf = (png: Buffer): [number, number] => [
  png.readUInt32BE(16),
  png.readUInt32BE(20),
];

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
      read: (path) => path.includes('nunito-latin-400'),
    });
    const renderer = new Renderer(null, 'owl.example.org', 5, { budget: null });
    await expect(renderer.render(data)).rejects.toThrow('too many open files');
    const png = await renderer.render(data);
    expect(png.subarray(0, 8)).toEqual(PNG);
    expect(reads.filter((p) => p.includes('nunito-latin-400'))).toHaveLength(2);
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
      read: (path) => path.includes('noto-sans-cjk-jp-regular'),
    });
    const renderer = new Renderer(REAL_CLIENT, 'owl.example.org', 5, {
      budget: null,
    });
    // The first read fails and the picture is drawn without the font; the next
    // version asks again and gets it.
    const without = await renderer.render(versionOf(data, 1));
    const withFont = await renderer.render(versionOf(data, 2));
    expect(
      reads.filter((p) => p.includes('noto-sans-cjk-jp-regular'))
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
    // Emoji and symbols are left as they were.
    expect((await pictureOf('Party 🎉')).equals(await pictureOf('Party'))).toBe(
      false
    );
  });
});

describe('drawableTitle', () => {
  const app = 'Owl Be There';
  const drawn = (title: string, cjk = false) => drawableTitle(title, app, cjk);

  it('leaves titles of covered scripts, digits and punctuation alone', () => {
    for (const title of [
      '',
      ' ',
      'Grillabend Ü',
      'Привет 2026!',
      'Tiệc ạ',
      '2026',
      '…',
      '🎉',
      '!?',
    ])
      expect(drawn(title)).toBe(title);
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

  it('counts the marks that follow a lost letter as lost', () => {
    expect(drawn('שָׁלוֹם')).toBe(app);
    expect(drawn('Hello שָׁלוֹם')).toBe('Hello …');
  });

  it("draws the CJK font's scripts only when the font is loaded", () => {
    expect(drawn('忘年会')).toBe(app);
    expect(drawn('忘年会', true)).toBe('忘年会');
    expect(drawn('안녕 Γειά ー', true)).toBe('안녕 Γειά ー');
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
