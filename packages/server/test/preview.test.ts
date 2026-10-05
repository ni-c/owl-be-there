import { Resvg } from '@resvg/resvg-wasm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { migrate } from '../src/db/migrations.js';
import { snapshot } from '../src/db/repo.js';
import { Db } from '../src/db/sqlite.js';
import { PreviewBusy, PreviewRenderer } from '../src/preview.js';
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
