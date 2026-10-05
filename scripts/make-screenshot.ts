/**
 * Renders the pictures of the example in the README: the start page's live
 * example — next month's team dinner — in its browser window, as a desktop
 * browser shows it, once light and once dark. Then renews `og.png`, the
 * default link-preview picture of the start pages and the privacy page (an
 * event link draws its own, see `packages/server/src/preview.ts`): 1200 × 630,
 * the owl and the name. This is the only way `og.png` is made; run it after
 * changing the owl, the name or the heatmap colours.
 *
 *     npm run build
 *     npm run screenshot                    # docs/ and packages/client/public
 *     npm run screenshot -- --out <dir>     # all three into <dir>, as CI does
 *
 * The start page builds the example itself, so this only has to look: it runs
 * the built server on a temporary data directory and Playwright's Chromium,
 * which the end-to-end suite installs. The `og.png` picture needs no server.
 */
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Browser, type Page } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');

// Anything but `--out <dir>` (or `--out=<dir>`) is refused: a typo must not fall
// back to overwriting the tracked pictures.
let out: string | undefined;
try {
  out = parseArgs({ strict: true, options: { out: { type: 'string' } } }).values
    .out;
  if (out === '') throw new Error('--out needs a directory');
} catch (error) {
  console.error(
    `${(error as Error).message}\nusage: npm run screenshot [-- --out <dir>]`
  );
  process.exit(2);
}
const outDir = out === undefined ? join(root, 'docs') : resolve(out);
const ogPath =
  out === undefined
    ? join(root, 'packages/client/public/og.png')
    : join(outDir, 'og.png');
// A port the system hands out, so a leftover server of an earlier run, or any
// other listener, cannot be mistaken for the one started here.
const PORT = await new Promise<number>((done, fail) => {
  const probe = createServer();
  probe.once('error', fail);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address() as AddressInfo;
    probe.close(() => done(port));
  });
});
const base = `http://127.0.0.1:${PORT}`;

for (const built of ['packages/server/dist/index.js', 'packages/client/dist']) {
  if (!existsSync(join(root, built))) {
    console.error(`${built} is missing; run npm run build first.`);
    process.exit(2);
  }
}

async function waitForServer(failure: () => Error | null): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const died = failure();
    if (died) throw died;
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error('The server did not start');
}

async function shoot(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.goto(base);
  const frame = page.locator('[data-browser-frame]');
  await frame.getByRole('grid', { name: 'Group' }).waitFor();
  // Nothing hovered or focused in the picture.
  await page.mouse.move(0, 0);
  // Everything around the window hidden and see-through, so nothing reaches
  // into its margin — through the CSSOM, as the content security policy
  // refuses a style tag.
  await frame.evaluate((subject) => {
    for (const element of document.querySelectorAll<HTMLElement>('*')) {
      if (subject.contains(element)) continue;
      if (!element.contains(subject)) element.style.visibility = 'hidden';
      element.style.background = 'transparent';
      element.style.boxShadow = 'none';
    }
  });
  // In page coordinates: a full-page clip counts from the top of the page,
  // not from wherever it is scrolled to.
  const box = await frame.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  });
  const margin = 32;
  const path = join(outDir, `screenshot-${theme}.png`);
  await page.screenshot({
    path,
    fullPage: true,
    omitBackground: true,
    animations: 'disabled',
    clip: {
      x: box.x - margin,
      y: box.y - margin,
      width: box.width + 2 * margin,
      height: box.height + 2 * margin,
    },
  });
  console.log(`screenshot-${theme}.png: ${statSync(path).size} bytes`);
}

// The picture is typeset in the bundled Nunito, like the app and the per-event
// pictures, not in whatever font the machine running this happens to have.
const require = createRequire(import.meta.url);
const font = (weight: 400 | 800) =>
  readFileSync(
    require.resolve(
      `@fontsource/nunito/files/nunito-latin-${weight}-normal.woff2`
    )
  ).toString('base64');
const fontFace = (weight: 400 | 800) =>
  `@font-face { font-family: 'Nunito'; font-weight: ${weight}; src: url(data:font/woff2;base64,${font(weight)}) format('woff2'); }`;

/** The default link-preview picture: the owl, the name and a strip of heat. */
async function shootOg(browser: Browser): Promise<void> {
  const owl = readFileSync(
    join(root, 'packages/client/public/favicon.svg'),
    'utf8'
  );
  // The empty cell and the steps of the heatmap ramp (`PREVIEW_COLOURS.heat` in
  // shared/preview.ts), as a strip of calendar days.
  const cells = [
    '#f1e8da',
    '#6fbc9f',
    '#f1e8da',
    '#4aa685',
    '#268262',
    '#0e5441',
    '#1a7055',
  ];
  const html = `<!doctype html><html><head><style>
  ${fontFace(400)}
  ${fontFace(800)}
  html, body { margin: 0; width: 1200px; height: 630px; }
  body { display: flex; align-items: center; justify-content: center; gap: 64px;
    background: #fbf6ee; font-family: 'Nunito', ui-rounded, system-ui, sans-serif; color: #2a2118; }
  .owl { width: 340px; height: 352px; }
  h1 { font-size: 92px; margin: 0; font-weight: 800; letter-spacing: -2px; }
  p { font-size: 40px; margin: 16px 0 0; color: #6b5b4a; font-weight: 400; max-width: 640px; }
  .cal { display: grid; grid-template-columns: repeat(7, 46px); gap: 8px; margin-top: 36px; }
  .cal span { height: 46px; border-radius: 12px; }
</style></head><body>
  <div class="owl">${owl}</div>
  <div>
    <h1>Owl Be There</h1>
    <p>Find a day everyone can make.</p>
    <div class="cal">${cells
      .map((c) => `<span style="background:${c}"></span>`)
      .join('')}</div>
  </div>
</body></html>`;

  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
  });
  try {
    await page.setContent(html);
    await page.evaluate(() =>
      Promise.all([
        document.fonts.load('800 92px Nunito'),
        document.fonts.load('400 40px Nunito'),
      ])
    );
    if (
      !(await page.evaluate(
        () =>
          document.fonts.check('800 92px Nunito') &&
          document.fonts.check('400 40px Nunito')
      ))
    )
      throw new Error('The bundled Nunito did not load');
    await page.locator('.owl svg').evaluate((svg) => {
      svg.setAttribute('width', '340');
      svg.setAttribute('height', '352');
    });
    await page.screenshot({ path: ogPath, type: 'png' });
  } finally {
    await page.close();
  }
  console.log(`og.png: ${statSync(ogPath).size} bytes`);
}

const dataDir = mkdtempSync(join(tmpdir(), 'owl-screenshot-'));
const server = spawn('node', ['packages/server/dist/index.js'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    PUBLIC_URL: base,
    CLIENT_DIR: 'packages/client/dist',
    DATA_DIR: dataDir,
    LOG_LEVEL: 'warn',
  },
});

// A server that dies at start is reported at once, not after the poll limit.
let serverFailure: Error | null = null;
server.once('error', (error) => {
  serverFailure = error;
});
server.once('exit', (code, signal) => {
  serverFailure = new Error(
    `The server exited (code ${code}, signal ${signal})`
  );
});

// An interrupted run still stops the server and removes its data directory;
// the `finally` below does not run on a signal.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.kill();
    rmSync(dataDir, { recursive: true, force: true });
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

try {
  mkdirSync(outDir, { recursive: true });
  await waitForServer(() => serverFailure);
  const browser = await chromium.launch();
  try {
    for (const theme of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1.25,
        locale: 'en-GB',
        colorScheme: theme,
      });
      await context.addInitScript((choice) => {
        localStorage.setItem('owl.theme', JSON.stringify(choice));
        localStorage.setItem('owl.lang', JSON.stringify('en'));
      }, theme);
      await shoot(await context.newPage(), theme);
      await context.close();
    }
    await shootOg(browser);
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}
