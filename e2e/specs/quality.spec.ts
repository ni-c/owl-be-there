import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  answer,
  createEvent,
  day,
  dayFromNow,
  groupCalendar,
  joinAs,
  myCalendar,
  saved,
  showView,
  utcDateOf,
} from '../helpers.ts';

/** Fail on anything axe calls serious or critical against WCAG 2.2 AA. */
async function expectAccessible(page: Page, label: string): Promise<void> {
  // A freshly marked day fades to its colour; measured halfway, its contrast
  // is neither the old one nor the new one. Transitions only: the owl bobs
  // for ever.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => !(a instanceof CSSTransition) || a.playState !== 'running')
  );
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    // Days outside the range are faded on purpose and hidden from assistive
    // technology: text of an inactive component has no contrast requirement
    // (WCAG 1.4.3, "Incidental"). Whether a row has any depends on the date.
    .exclude('.cal-cell[data-kind="outside"]')
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
    // Eight axe scans take 24-28 s in WebKit, too close to the 30 s default.
    test.slow();
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
    // The example's day sheet, with its notes block.
    const frame = page.locator('[data-browser-frame]');
    const groupTab = frame.getByRole('tab', { name: /^Group/ });
    if (await groupTab.isVisible()) await groupTab.click();
    const example = frame.getByRole('grid', { name: 'Group' });
    const days = await example
      .locator('[data-day]')
      .evaluateAll((cells) => cells.map((c) => c.getAttribute('data-day')!));
    const thursday = days.find(
      (iso) => utcDateOf(iso).getUTCDay() === 4 && Number(iso.slice(8)) >= 15
    )!;
    await day(example, thursday).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectAccessible(page, 'example day sheet');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await page.getByRole('button', { name: 'Plan an event' }).click();
    await expectAccessible(page, 'wizard');

    await page.goto(`/e/${id}#admin=${adminToken}`);
    await joinAs(page, 'Ben');
    await expectAccessible(page, 'my days');
    // Marked days have their own colours; check them too.
    const mine = myCalendar(page);
    await day(mine, dayFromNow(5)).click();
    await page.getByRole('radio', { name: 'Maybe' }).click();
    await day(mine, dayFromNow(6)).click();
    await expect(day(mine, dayFromNow(6))).toHaveAttribute(
      'data-state',
      'maybe'
    );
    // The status in green, below the note.
    await saved(page);
    await expectAccessible(page, 'my days, marked');
    // The entry section, with its framed red delete button.
    await page.getByRole('button', { name: 'Edit entry' }).click();
    await expectAccessible(page, 'my days, entry');
    await showView(page, 'group');
    await expectAccessible(page, 'group');
    // The day sheet: names as chips in each group's colour, one group empty.
    await day(groupCalendar(page), dayFromNow(5)).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectAccessible(page, 'day sheet');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await page.getByRole('button', { name: 'Share' }).click();
    await expectAccessible(page, 'share sheet');

    await page.goto('/privacy');
    await expectAccessible(page, 'privacy');
    await page.goto('/imprint');
    await expectAccessible(page, 'imprint');
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
  // Not the console: WebKit logs the styles Playwright injects for itself
  // there too. The page is told only about its own violations.
  await page.exposeFunction('reportViolation', (violation: string) =>
    violations.push(violation)
  );
  await page.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (event) => {
      // WebKit reports the inline style of a select's own shadow tree against
      // the page, on a select that carries no style attribute.
      const target = event.target;
      if (
        event.effectiveDirective === 'style-src-attr' &&
        target instanceof HTMLSelectElement &&
        !target.hasAttribute('style')
      )
        return;
      const report = (window as unknown as Record<string, (v: string) => void>)
        .reportViolation!;
      report(
        `${event.effectiveDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}`
      );
    })
  );
  page.on('pageerror', (error) => violations.push(error.message));

  const { id } = await createEvent(request);
  // Let the start page's own request finish: WebKit logs one that a navigation
  // cuts off as a failed access control check.
  const instance = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/instance'
  );
  await page.goto('/');
  await (await instance).finished();
  // A language loaded later, preloaded by the inline script: its own server too.
  await page.goto('/fa');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
  // Back to English, which the steps below speak: an address is a choice.
  await page.goto('/en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto(`/e/${id}`);
  await joinAs(page, 'Carla');
  await day(myCalendar(page), dayFromNow(4)).click();
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
  // The event's own picture: its calendar, drawn by the server.
  const own = /<meta property="og:image" content="([^"]+)"/.exec(html)![1]!;
  const url = new URL(own);
  expect(url.pathname).toBe(`/e/${id}/og.png`);
  const picture = await request.get(url.pathname + url.search);
  expect(picture.headers()['content-type']).toBe('image/png');
  expect((await picture.body()).length).toBeLessThan(300_000);
});

test('the 404 link and the "plan your own" link look and behave like buttons: keyboard focus, a ring, a big target, axe', async ({
  page,
  request,
}) => {
  // Tab once so the browser is in keyboard mode, then focus the link: that is
  // what `:focus-visible` needs in WebKit, where Tab skips links by default.
  const focusedByKeyboard = async (link: Locator) => {
    await page.keyboard.press('Tab');
    await link.focus();
    await expect(link).toBeFocused();
    return link.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        focusVisible: element.matches(':focus-visible'),
        outlineStyle: computed.outlineStyle,
        outlineWidth: computed.outlineWidth,
      };
    });
  };
  const ring = {
    focusVisible: true,
    outlineStyle: 'solid',
    outlineWidth: '3px',
  };

  await page.goto('/nowhere');
  const home = page.getByRole('link', { name: 'Go to the start page' });
  await expect(home).toBeVisible();
  expect(await focusedByKeyboard(home)).toEqual(ring);
  expect((await home.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expectAccessible(page, '404 page');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/$/);

  const { id } = await createEvent(request, { roster: ['Anna'] });
  await page.goto(`/e/${id}`);
  await showView(page, 'mine');
  await page.getByRole('button', { name: 'Anna' }).click();
  await day(myCalendar(page), dayFromNow(5)).click();
  await saved(page);
  const invite = page
    .getByRole('main')
    .getByRole('link', { name: 'Plan an event' });
  await expect(invite).toBeVisible();
  expect(await focusedByKeyboard(invite)).toEqual(ring);
  expect((await invite.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expectAccessible(page, 'event page with the invitation');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/$/);
});
