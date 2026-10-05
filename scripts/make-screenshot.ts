/**
 * Renders the pictures of the example in the README: the start page's live
 * example — next month's team dinner — in its browser window, as a desktop
 * browser shows it, once light and once dark. Then renews `og.png` too.
 *
 *     npm run build
 *     npm run screenshot                    # docs/ and packages/client/public
 *     npm run screenshot -- --out <dir>     # all three into <dir>, as CI does
 *
 * The start page builds the example itself, so this only has to look: it runs
 * the built server on a temporary data directory and Playwright's Chromium,
 * which the end-to-end suite installs.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const outFlag = process.argv.indexOf('--out');
const outDir =
  outFlag === -1
    ? join(root, 'docs')
    : resolve(process.argv[outFlag + 1] ?? '.');
const ogPath =
  outFlag === -1
    ? join(root, 'packages/client/public/og.png')
    : join(outDir, 'og.png');
const PORT = 4321;
const base = `http://127.0.0.1:${PORT}`;

for (const built of ['packages/server/dist/index.js', 'packages/client/dist']) {
  if (!existsSync(join(root, built))) {
    console.error(`${built} is missing; run npm run build first.`);
    process.exit(2);
  }
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
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

try {
  mkdirSync(outDir, { recursive: true });
  await waitForServer();
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
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}

// The link preview picture belongs to the same set of pictures.
const og = spawn('node', ['scripts/make-og-image.ts', ogPath], {
  cwd: root,
  stdio: 'inherit',
});
const code = await new Promise<number | null>((done) => og.on('exit', done));
process.exit(code ?? 1);
