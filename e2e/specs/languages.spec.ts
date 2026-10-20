import { expect, test, type Page } from '@playwright/test';
import { isMobile } from '../helpers.ts';

/** Holds a language's chunk until the returned function lets it through. */
async function holdChunk(page: Page, language: string): Promise<() => void> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    new RegExp(`/assets/${language}-[^/]+\\.js$`),
    async (route) => {
      await gate;
      await route.continue();
    }
  );
  return release;
}

const preloaded = (page: Page, language: string) =>
  page.locator(`link[rel="modulepreload"][href^="/assets/${language}-"]`);

test('a language address preloads its texts, and the page never shows English first', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { seenLang: string[] }).seenLang = seen;
    new MutationObserver(() =>
      seen.push(document.documentElement.lang)
    ).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang'],
    });
  });
  await page.goto('/fa');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByLabel('زبان')).toBeVisible();
  await expect(preloaded(page, 'fa')).toHaveCount(1);
  const seen = await page.evaluate(
    () => (window as unknown as { seenLang: string[] }).seenLang
  );
  expect(seen.filter((lang) => lang !== 'fa')).toEqual([]);
});

test('the stored choice is preloaded on the plain start page', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('owl.lang', '"ja"'));
  await page.goto('/');
  await expect(page.getByLabel('言語')).toBeVisible();
  await expect(preloaded(page, 'ja')).toHaveCount(1);
});

test.describe('in a browser set to Brazilian Portuguese', () => {
  test.use({ locale: 'pt-BR' });

  test('the browser’s language is preloaded', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await expect(preloaded(page, 'pt-BR')).toHaveCount(1);
  });
});

test('a switch keeps the page until the new texts are here, and keeps the focus', async ({
  page,
}, testInfo) => {
  test.skip(isMobile(testInfo), 'keyboards are a desktop thing');
  const release = await holdChunk(page, 'ja');
  await page.goto('/privacy');
  const select = page.getByLabel('Language');
  await select.focus();
  await select.selectOption('ja');
  // The select shows the choice at once; the page waits for its texts.
  await expect(select).toHaveValue('ja');
  await expect(page).toHaveTitle('Privacy · Owl Be There');
  await expect(select).toBeFocused();
  release();
  await expect(page).toHaveTitle('プライバシー · Owl Be There');
  await expect(page.getByLabel('言語')).toBeFocused();
});

test('right to left stays until the next language is here', async ({
  page,
}) => {
  const release = await holdChunk(page, 'ja');
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByLabel('اللغة').selectOption('ja');
  await expect(page).toHaveURL(/\/ja$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  release();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('a language that cannot load reloads the page once, then says so', async ({
  page,
}) => {
  await page.route(/\/assets\/ja-[^/]+\.js$/, (route) => route.abort());
  let loads = 0;
  page.on('load', () => {
    loads += 1;
  });
  await page.goto('/privacy');
  await page.getByLabel('Language').selectOption('ja');
  await expect(page.getByRole('alert')).toContainText('日本語');
  await expect(page).toHaveTitle('Privacy · Owl Be There');
  expect(loads).toBe(2);
  await page.waitForTimeout(500);
  expect(loads).toBe(2);
});

test('every file the pages list for a language is there', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const list = JSON.parse(
    (await page.locator('#owl-i18n').textContent()) ?? '{}'
  ) as Record<string, string[]>;
  expect(list.en).toEqual([]);
  expect(list.de).toEqual([]);
  const files = Object.values(list).flat();
  expect(files.length).toBeGreaterThanOrEqual(24);
  for (const file of files) {
    const response = await request.get(file);
    expect(response.status(), file).toBe(200);
    expect(response.headers()['content-type'], file).toMatch(/javascript/);
  }
});
