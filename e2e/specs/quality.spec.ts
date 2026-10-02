import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  answer,
  createEvent,
  dayFromNow,
  joinAs,
  showView,
} from '../helpers.ts';

/** Fail on anything axe calls serious or critical against WCAG 2.2 AA. */
async function expectAccessible(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  );
  expect(
    serious.map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`
    ),
    label
  ).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`pages pass axe in ${scheme} mode`, async ({ browser, request }) => {
    const context = await browser.newContext({
      colorScheme: scheme,
      locale: 'en-GB',
    });
    const page = await context.newPage();
    const { id, adminToken } = await createEvent(request, {
      minCount: 2,
      description: 'Bring a ball.',
    });
    await answer(
      request,
      id,
      'Anna',
      [dayFromNow(5), dayFromNow(6)],
      [dayFromNow(7)]
    );

    await page.goto('/');
    await expectAccessible(page, 'home');
    await page.getByRole('button', { name: 'Plan an event' }).click();
    await expectAccessible(page, 'wizard');

    await page.goto(`/e/${id}#admin=${adminToken}`);
    await joinAs(page, 'Ben');
    await expectAccessible(page, 'my days');
    await showView(page, 'group');
    await expectAccessible(page, 'group');
    await page.getByRole('button', { name: 'Share' }).click();
    await expectAccessible(page, 'share sheet');

    await page.goto('/privacy');
    await expectAccessible(page, 'privacy');
    await context.close();
  });
}

test('the app talks to nobody but its own server and breaks no CSP rule', async ({
  page,
  request,
  baseURL,
}) => {
  const foreign: string[] = [];
  const violations: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (
      url.origin !== new URL(baseURL!).origin &&
      !url.protocol.startsWith('data')
    )
      foreign.push(r.url());
  });
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text()))
      violations.push(message.text());
  });
  page.on('pageerror', (error) => violations.push(error.message));

  const { id } = await createEvent(request);
  await page.goto('/');
  await page.goto(`/e/${id}`);
  await joinAs(page, 'Carla');
  await page
    .locator(`[data-day="${dayFromNow(4)}"]`)
    .first()
    .click();
  await showView(page, 'group');
  await page.getByRole('button', { name: 'Share' }).click();
  await page.waitForTimeout(500);

  expect(foreign).toEqual([]);
  expect(violations).toEqual([]);
});

test('an event page tells link previews its title, and the API is off limits to robots', async ({
  request,
}) => {
  const { id } = await createEvent(request, { title: 'Pub quiz' });
  const page = await request.get(`/e/${id}`);
  const html = await page.text();
  expect(html).toContain('<meta property="og:title" content="⚽ Pub quiz" />');
  expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toContain('Disallow: /api/');
  const image = await request.get('/og.png');
  expect(image.headers()['content-type']).toBe('image/png');
  expect((await image.body()).length).toBeLessThan(600_000);
});
