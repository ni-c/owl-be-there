/**
 * Renders `packages/client/public/og.png`, the picture messengers show beside
 * an event link: 1200 × 630, the owl and the name. Run after changing either:
 *
 *     node scripts/make-og-image.ts
 *
 * Uses Playwright's Chromium, which the end-to-end suite installs anyway.
 */
import { readFileSync, statSync } from 'node:fs';
import { chromium } from '@playwright/test';

const owl = readFileSync(
  new URL('../packages/client/public/favicon.svg', import.meta.url),
  'utf8'
);
const out = new URL('../packages/client/public/og.png', import.meta.url);

const html = `<!doctype html><html><head><style>
  html, body { margin: 0; width: 1200px; height: 630px; }
  body { display: flex; align-items: center; justify-content: center; gap: 64px;
    background: #fbf6ee; font-family: 'Nunito', ui-rounded, system-ui, sans-serif; color: #2a2118; }
  .owl { width: 340px; height: 352px; }
  h1 { font-size: 92px; margin: 0; font-weight: 900; letter-spacing: -2px; }
  p { font-size: 40px; margin: 16px 0 0; color: #6b5b4a; font-weight: 700; max-width: 640px; }
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
await page.locator('.owl svg').evaluate((svg) => {
  svg.setAttribute('width', '340');
  svg.setAttribute('height', '352');
});
await page.screenshot({ path: out.pathname, type: 'png' });
await browser.close();
console.log(`og.png: ${statSync(out).size} bytes`);
