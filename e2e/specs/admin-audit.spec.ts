import { expect, test } from '@playwright/test';
import {
  createEvent,
  day,
  dayFromNow,
  openAsOrganiser,
  organiserTools,
} from '../helpers.ts';

test('a wizard step change moves focus to the step legend, and Back and Cancel are disabled while creating', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/events', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await held;
    return route.fallback();
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Plan an event' }).click();
  await page.getByLabel('Title').fill('Focus check');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('legend:focus')).toHaveCount(1);
  await page.getByRole('button', { name: /: Saturday$/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('legend:focus')).toHaveCount(1);
  const back = page.getByRole('button', { name: 'Back' });
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('legend:focus')).toHaveCount(1);
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('button', { name: 'Create event' }).click();
  await expect(page.getByRole('button', { name: 'Creating…' })).toBeDisabled();
  await expect(back).toBeDisabled();
  release();
  await expect(
    page.getByRole('heading', { name: 'Share with your group' })
  ).toBeVisible();
});

test('the days editor returns focus to the panel heading after a save', async ({
  page,
  request,
}) => {
  const event = await createEvent(request);
  await openAsOrganiser(page, event);
  const days = page.locator('details').filter({
    has: page.locator('summary', { hasText: 'Days' }),
  });
  await days.locator('summary').click();
  await day(days.getByRole('grid'), dayFromNow(16)).click();
  await days.getByRole('button', { name: 'Save' }).click();
  await expect(days.getByText('Saved')).toBeVisible();
  await expect(organiserTools(page)).toBeFocused();
});

test('the details form shows the translated title error instead of a browser bubble', async ({
  page,
  request,
}) => {
  const event = await createEvent(request);
  await openAsOrganiser(page, event);
  const details = page.locator('details').filter({
    has: page.locator('summary', { hasText: 'Details' }),
  });
  await details.locator('summary').click();
  await details.getByLabel('Title').fill('');
  await details.getByRole('button', { name: 'Save' }).click();
  await expect(
    details.getByText('Please give the event a title.')
  ).toBeVisible();
  await expect(details.getByLabel('Title')).toHaveAttribute(
    'aria-invalid',
    'true'
  );
});
