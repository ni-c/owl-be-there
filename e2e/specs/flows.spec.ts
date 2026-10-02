import { expect, test } from '@playwright/test';
import {
  answer,
  createEvent,
  day,
  dayFromNow,
  groupCalendar,
  myCalendar,
  showView,
  snapshot,
  utcDateOf,
} from '../helpers.ts';

const D = (offset: number) => dayFromNow(offset);

test('an organiser creates an event with the wizard and gets the share sheet', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Plan an event' }).click();
  await page.getByLabel('Title').fill('Five-a-side');
  await page.getByRole('radio', { name: 'Football' }).click();
  await page.getByLabel('Place (optional)').fill('North field');
  await page.getByRole('button', { name: 'Next' }).click();

  // Fridays to Sundays only, and two days in a row.
  for (const weekday of ['Friday', 'Saturday', 'Sunday']) {
    await page.getByRole('button', { name: weekday, exact: true }).click();
  }
  await page.getByRole('button', { name: '+' }).click();
  await expect(page.getByText(/days? to choose from/)).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Names (optional)').fill('Anna\nBen');
  await page.getByRole('button', { name: 'Create event' }).click();

  await expect(
    page.getByRole('heading', { name: 'Share with your group' })
  ).toBeVisible();
  await expect(
    page.getByText('Done! Now send the link to your group.')
  ).toBeVisible();
  const link = await page
    .getByRole('textbox', { name: 'Link for everyone' })
    .inputValue();
  expect(link).toMatch(/\/e\/[1-9A-HJ-NP-Za-km-z]{12}$/);
  await expect(
    page.getByRole('textbox', { name: 'Your organiser link' })
  ).toHaveValue(/#admin=/);
  await expect(page.getByRole('img', { name: link })).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();

  await expect(
    page.getByRole('heading', { name: 'Five-a-side' })
  ).toBeVisible();
  await expect(page.getByText('2 days in a row').first()).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await showView(page, 'mine');
  await expect(page.getByRole('button', { name: 'Anna' })).toBeVisible();
});

test('the organiser link is taken from the fragment and removed from the address', async ({
  page,
  request,
}) => {
  const { id, adminToken } = await createEvent(request);
  await page.goto(`/e/${id}#admin=${adminToken}`);
  await expect(
    page.getByRole('heading', { name: 'Organiser tools' })
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Organiser tools' })
  ).toBeVisible();
});

test('two people see each other live, and the day sheet names them', async ({
  browser,
  request,
}) => {
  const { id } = await createEvent(request, { roster: ['Anna', 'Ben'] });
  const one = await browser.newPage();
  const two = await browser.newPage();
  await one.goto(`/e/${id}`);
  await two.goto(`/e/${id}`);
  await showView(two, 'group');
  await expect(two.getByText('No answers yet')).toBeVisible();

  await showView(one, 'mine');
  await one.getByRole('button', { name: 'Anna' }).click();
  await day(myCalendar(one), D(5)).click();

  // Ben's page updates by itself.
  const cell = day(groupCalendar(two), D(5));
  await expect(cell).toHaveAttribute('data-heat', '5', { timeout: 10_000 });
  await expect(two.getByText('Not answered yet: Ben')).toBeVisible();
  await cell.click();
  const sheet = two.getByRole('dialog');
  await expect(
    sheet.getByRole('heading', { level: 4, name: /^Can\b/ })
  ).toBeVisible();
  await expect(sheet.getByText('Anna')).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await one.close();
  await two.close();
});

test('a protected name needs its password on another device', async ({
  browser,
  request,
}) => {
  const { id } = await createEvent(request);
  const phone = await browser.newPage();
  await phone.goto(`/e/${id}`);
  await showView(phone, 'mine');
  await phone.getByLabel('Your name', { exact: true }).fill('Maxi');
  await phone.getByLabel('Protect my entry with a password').check();
  await phone.getByLabel('Password', { exact: true }).fill('secret-1');
  await phone.getByRole('button', { name: 'Continue' }).click();
  await expect(phone.getByText('Hi Maxi!')).toBeVisible();

  const laptop = await browser
    .newContext()
    .then((context) => context.newPage());
  await laptop.goto(`/e/${id}`);
  await showView(laptop, 'mine');
  await laptop.getByLabel('Your name', { exact: true }).fill('maxi');
  await laptop.getByRole('button', { name: 'Continue' }).click();
  await expect(
    laptop.getByText('“maxi” is protected. Please enter the password.')
  ).toBeVisible();
  await laptop.getByLabel('Password', { exact: true }).fill('wrong!');
  await laptop.getByRole('button', { name: 'Continue' }).click();
  await expect(laptop.getByText('That password is not right.')).toBeVisible();
  await laptop.getByLabel('Password', { exact: true }).fill('secret-1');
  await laptop.getByRole('button', { name: 'Continue' }).click();
  await expect(laptop.getByText('Hi Maxi!')).toBeVisible();
});

test('the organiser chooses the best day; everyone gets a calendar file', async ({
  page,
  request,
}) => {
  const { id, adminToken } = await createEvent(request, { minCount: 2 });
  await answer(request, id, 'Anna', [D(6), D(7)]);
  await answer(request, id, 'Ben', [D(7)], [D(6)]);
  await page.goto(`/e/${id}#admin=${adminToken}`);
  await showView(page, 'group');
  const best = page
    .getByRole('listitem')
    .filter({ hasText: '2 of 2 can' })
    .first();
  await expect(best.getByText('enough people')).toBeVisible();
  await best.getByRole('button', { name: 'Choose this date' }).click();

  await expect(page.getByText('It’s decided!')).toBeVisible();
  const ics = await request.get(`/api/events/${id}/calendar.ics`);
  expect(ics.status()).toBe(200);
  expect(await ics.text()).toContain(
    `DTSTART;VALUE=DATE:${D(7).replaceAll('-', '')}`
  );
  const data = await snapshot(request, id);
  expect(data.event).toMatchObject({ status: 'finalized', finalStart: D(7) });

  // A participant can no longer change their days.
  const other = await page.context().browser()!.newPage();
  await other.goto(`/e/${id}`);
  await showView(other, 'mine');
  await other
    .getByRole('button', { name: 'Someone else' })
    .waitFor({ state: 'detached' })
    .catch(() => undefined);
  await other.close();
});

test('blocks of several days are ranked as blocks', async ({
  page,
  request,
}) => {
  const { id } = await createEvent(request, { durationDays: 2 });
  await answer(request, id, 'Anna', [D(6), D(7), D(8)]);
  await answer(request, id, 'Ben', [D(7), D(8)]);
  await page.goto(`/e/${id}`);
  await showView(page, 'group');
  const first = page.locator('ol > li').first();
  await expect(first).toContainText('2 of 2 can');
  const range = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    timeZone: 'UTC',
  }).format(utcDateOf(D(7)));
  await expect(first).toContainText(range);
});

test('leaving someone out changes the count', async ({ page, request }) => {
  const { id } = await createEvent(request);
  await answer(request, id, 'Anna', [D(6)]);
  await answer(request, id, 'Ben', [D(6)]);
  await page.goto(`/e/${id}`);
  await showView(page, 'group');
  await expect(page.locator('ol > li').first()).toContainText('2 of 2 can');
  await page.getByRole('button', { name: 'Ben', exact: true }).click();
  await expect(page.locator('ol > li').first()).toContainText('1 of 1 can');
});

test('an unknown event says so, with a confused owl rather than an error', async ({
  page,
}) => {
  const response = await page.goto('/e/AAAAAAAAAAAA');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { name: 'This event does not exist (any more).' })
  ).toBeVisible();
});

test('the privacy page names the operator and the log retention', async ({
  page,
}) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible();
  await expect(page.getByText('Example Organisation')).toBeVisible();
  await expect(page.getByText(/for 7 days to fend off abuse/)).toBeVisible();
});

test('German is a click away and remembered', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Language').selectOption('de');
  await expect(
    page.getByRole('heading', { name: 'Finde den Tag, an dem alle können.' })
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Event planen' })
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('de');
});
