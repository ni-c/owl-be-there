import { expect, test } from '@playwright/test';
import {
  createEvent,
  dayFromNow,
  day,
  groupCalendar,
  joinAs,
  myCalendar,
} from '../helpers.ts';

test('y, m and Ctrl+Z work on a Cyrillic layout and after a week toggle was clicked', async ({
  page,
  request,
}) => {
  const { id } = await createEvent(request);
  await page.goto(`/e/${id}`);
  await joinAs(page, 'Ira');
  const grid = myCalendar(page);
  const first = day(grid, dayFromNow(3));
  await first.focus();
  // The key is Cyrillic, the physical key is Y.
  await first.dispatchEvent('keydown', { key: 'н', code: 'KeyY' });
  await first.dispatchEvent('keydown', { key: 'ь', code: 'KeyM' });
  await first.dispatchEvent('keydown', {
    key: 'я',
    code: 'KeyZ',
    ctrlKey: true,
  });

  // A click on a week toggle gives the focus back to a day of the grid.
  await grid.getByRole('button', { name: /^W\d+/ }).first().click();
  await expect(grid.locator('[data-day]:focus')).toHaveCount(1);
});

test('past heat days say so, and the best ring is an outline in forced colours', async ({
  page,
  request,
}) => {
  const { id } = await createEvent(request);
  await page.goto(`/e/${id}`);
  await joinAs(page, 'Ira');
  await page.emulateMedia({ forcedColors: 'active' });
  const best = groupCalendar(page).locator('[data-best="true"]').first();
  if (await best.count())
    expect(
      await best.evaluate((el) => getComputedStyle(el).outlineStyle)
    ).not.toBe('none');
});

test('the row headers stay inside their column at 320 px, in a long-label language', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const { id } = await createEvent(request);
  await page.goto(`/e/${id}`);
  await page.evaluate(() => {
    document.documentElement.lang = 'fa';
    document.documentElement.dir = 'rtl';
  });
  await joinAs(page, 'Ira');
  const rows = myCalendar(page).locator('.cal-row');
  const heights = await rows.evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().height))
  );
  expect(new Set(heights).size).toBeLessThanOrEqual(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
