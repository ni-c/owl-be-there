import { expect, test } from '@playwright/test';
import { answer, createEvent, dayFromNow, showView } from '../helpers.ts';

test('an event that does not exist takes the focus, so it is read out', async ({
  page,
}) => {
  await page.goto('/e/AAAAAAAAAAAA');
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
});

test('crossing the breakpoint keeps both panels mounted', async ({
  page,
  request,
}) => {
  const { id } = await createEvent(request);
  await answer(request, id, 'Anna', [dayFromNow(4)]);
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(`/e/${id}`);
  const grid = page.getByRole('grid', { name: 'Group' });
  await expect(grid).toBeVisible();
  await (await grid.elementHandle())!.evaluate((node) => {
    (node as HTMLElement).dataset.mark = 'kept';
  });
  await page.setViewportSize({ width: 600, height: 900 });
  await showView(page, 'group');
  await expect(page.locator('[data-mark="kept"]')).toHaveCount(1);
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.locator('[data-mark="kept"]')).toHaveCount(1);
});

test('the headings of the group view never skip a level', async ({
  page,
  request,
}) => {
  const { id } = await createEvent(request);
  await answer(request, id, 'Anna', [dayFromNow(4)]);
  for (const width of [1200, 600]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/e/${id}`);
    await showView(page, 'group');
    await expect(page.getByRole('grid', { name: 'Group' })).toBeVisible();
    const levels = await page
      .locator('main')
      .locator('h1, h2, h3, h4')
      .evaluateAll((nodes) =>
        nodes
          .filter(
            (node) =>
              node.getClientRects().length > 0 ||
              node.closest('[role=tabpanel]:not([hidden])')
          )
          .map((node) => Number(node.tagName[1]))
      );
    for (let i = 1; i < levels.length; i += 1)
      expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
  }
});

test('a stream that fails at network level falls back to polling', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const { id } = await createEvent(request);
  await page.route('**/api/events/*/stream', (route) => route.abort());
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(`/e/${id}`);
  await showView(page, 'group');
  await expect(page.getByText('No answers yet')).toBeVisible();
  await answer(request, id, 'Zora', [dayFromNow(4)]);
  await expect(page.getByText('Zora').first()).toBeVisible({
    timeout: 75_000,
  });
});
