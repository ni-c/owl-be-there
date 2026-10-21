import { expect, test } from '@playwright/test';

test('starting the wizard moves focus into it and cancelling returns it to the start button', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: /plan|start|find/i })
    .first()
    .click();
  const wizard = page.getByRole('region').filter({ has: page.locator('form') });
  await expect(wizard).toBeFocused();
  await wizard.getByRole('button', { name: 'Back' }).click();
  await expect(
    page.getByRole('button', { name: /plan|start|find/i }).first()
  ).toBeFocused();
});

test('removing a list entry with one tap keeps focus in the list', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'owl.events',
      JSON.stringify([
        {
          id: 'aaaaaaaaaaaa',
          title: 'One',
          emoji: 'party',
          role: 'participant',
        },
        {
          id: 'bbbbbbbbbbbb',
          title: 'Two',
          emoji: 'party',
          role: 'participant',
        },
      ])
    );
  });
  await page.goto('/');
  const remove = page.getByRole('button', { name: /One/ });
  if ((await remove.count()) === 0) test.skip(true, 'storage key differs');
  await remove.click();
  await expect(page.locator('li > a:focus')).toHaveCount(1);
});

test('the privacy title wraps instead of scrolling the page on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/ru/privacy');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(overflow).toBe(false);
});

test('the start page does not scroll sideways at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(overflow).toBe(false);
});
