/**
 * Renders `packages/client/public/og.png`, the picture messengers show beside
 * an event link: 1200 × 630, the owl and the name. Run after changing either:
 *
 *     node scripts/make-og-image.ts [<output path>]
 *
 * `npm run screenshot` runs it too, after the example screenshots.
 *
 * Uses Playwright's Chromium, which the end-to-end suite installs anyway.
 */
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const owl = readFileSync(
  new URL('../packages/client/public/favicon.svg', import.meta.url),
  'utf8'
);
// A path as the only argument writes elsewhere; `make-screenshot.ts` passes
// its output file. Anything else, a flag or an empty path included, is refused
// rather than taken for a file name.
let positionals: string[];
try {
  positionals = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {},
  }).positionals;
  if (positionals.length > 1 || positionals[0] === '')
    throw new Error('expected at most one non-empty output path');
} catch (error) {
  console.error(
    `${(error as Error).message}\nusage: node scripts/make-og-image.ts [<output path>]`
  );
  process.exit(2);
}
// A plain path, not a URL's `pathname`, which is percent-encoded.
const out = positionals[0]
  ? resolve(positionals[0])
  : fileURLToPath(new URL('../packages/client/public/og.png', import.meta.url));

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
  .cal span { height: 46px; border-radius: 12px; background: #f1e8da; }
</style></head><body>
  <div class="owl">${owl}</div>
  <div>
    <h1>Owl Be There</h1>
    <p>Find a day everyone can make.</p>
    <div class="cal">${[
      '#f1e8da',
      '#6fbc9f',
      '#f1e8da',
      '#4aa685',
      '#2c8b6c',
      '#0e5441',
      '#1a7055',
    ]
      .map((c) => `<span style="background:${c}"></span>`)
      .join('')}</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
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
await page.screenshot({ path: out, type: 'png' });
await browser.close();
console.log(`og.png: ${statSync(out).size} bytes`);
