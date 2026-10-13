import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  answer,
  createEvent,
  day,
  dayFromNow,
  groupCalendar,
  isMobile,
  myCalendar,
  saved,
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
  await page.getByRole('button', { name: 'One day more in a row' }).click();
  await expect(page.getByText(/days? to choose from/)).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Names (optional)').fill('Anna\nBen');
  await page.getByRole('button', { name: 'Create event' }).click();

  await expect(
    page.getByRole('heading', { name: 'Share with your group' })
  ).toBeVisible();
  await expect(
    page.getByText('All set! Send the link to the others.')
  ).toBeVisible();
  const link = await page
    .getByRole('textbox', { name: 'Link for everyone' })
    .inputValue();
  // The canonical origin from PUBLIC_URL, not the 127.0.0.1 the test opened.
  expect(link).toMatch(/^http:\/\/localhost:\d+\/e\/[1-9A-HJ-NP-Za-km-z]{12}$/);
  await expect(
    page.getByRole('textbox', { name: 'Your organiser link' })
  ).toHaveValue(/#admin=/);
  await expect(page.getByRole('img', { name: link })).toBeVisible();
  // The link for everyone, then the QR code, then the organiser's link — and
  // no invitation text to copy; the system share sheet carries that.
  await expect(page.getByLabel('Invitation text')).toHaveCount(0);
  const top = async (locator: Locator) => (await locator.boundingBox())!.y;
  const order = [
    await top(page.getByRole('textbox', { name: 'Link for everyone' })),
    await top(page.getByRole('img', { name: link })),
    await top(page.getByRole('textbox', { name: 'Your organiser link' })),
  ];
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();

  await expect(
    page.getByRole('heading', { name: 'Five-a-side' })
  ).toBeVisible();
  await expect(page.getByText('2 days in a row')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await showView(page, 'mine');
  await expect(page.getByRole('button', { name: 'Anna' })).toBeVisible();
});

test('changing the range keeps the days the organiser already chose', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Plan an event' }).click();
  await page.getByLabel('Title').fill('Book club');
  await page.getByRole('button', { name: 'Next' }).click();

  const from = page.getByLabel('From', { exact: true });
  const to = page.getByLabel('To', { exact: true });
  const grid = page.getByRole('grid', { name: 'Calendar' });
  const count = page.getByText(/days? to choose from/);

  await from.fill(D(3));
  await to.fill(D(10));
  await expect(count).toHaveText('8 days to choose from');
  // One day in the middle and the last day of the range taken away.
  await day(grid, D(5)).click();
  await day(grid, D(10)).click();
  await expect(count).toHaveText('6 days to choose from');

  // A longer range: the new days are candidates, the taken-away ones stay off.
  await to.fill(D(14));
  await expect(count).toHaveText('10 days to choose from');
  await expect(day(grid, D(5))).toHaveAttribute('aria-pressed', 'false');
  await expect(day(grid, D(10))).toHaveAttribute('aria-pressed', 'false');
  await expect(day(grid, D(12))).toHaveAttribute('aria-pressed', 'true');

  // A later start drops D(5) out of the range; moving back brings it back off.
  await from.fill(D(7));
  await expect(count).toHaveText('7 days to choose from');
  await expect(day(grid, D(5))).toHaveCount(0);
  await from.fill(D(3));
  await expect(count).toHaveText('10 days to choose from');
  await expect(day(grid, D(5))).toHaveAttribute('aria-pressed', 'false');
  await expect(day(grid, D(3))).toHaveAttribute('aria-pressed', 'true');
});

test('changing the weekdays keeps the days the organiser already chose', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Plan an event' }).click();
  await page.getByLabel('Title').fill('Book club');
  await page.getByRole('button', { name: 'Next' }).click();

  const grid = page.getByRole('grid', { name: 'Calendar' });
  const count = page.getByText(/days? to choose from/);
  const weekday = (iso: string) =>
    page.getByRole('button', {
      name: new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        timeZone: 'UTC',
      }).format(utcDateOf(iso)),
      exact: true,
    });

  // Two weeks, so every weekday is there twice.
  await page.getByLabel('From', { exact: true }).fill(D(3));
  await page.getByLabel('To', { exact: true }).fill(D(16));
  await expect(count).toHaveText('14 days to choose from');
  // A day left out by hand before any weekday is picked.
  await day(grid, D(6)).click();
  await expect(count).toHaveText('13 days to choose from');

  // The first weekday leaves only its own days, and keeps what was painted on them.
  await weekday(D(6)).click();
  await expect(count).toHaveText('1 day to choose from');
  await expect(day(grid, D(6))).toHaveAttribute('aria-pressed', 'false');
  await expect(day(grid, D(13))).toHaveAttribute('aria-pressed', 'true');

  // Another weekday adds its days and leaves D(6) alone.
  await weekday(D(4)).click();
  await expect(count).toHaveText('3 days to choose from');
  await day(grid, D(11)).click();
  await expect(count).toHaveText('2 days to choose from');
  await weekday(D(5)).click();
  await expect(count).toHaveText('4 days to choose from');
  await expect(day(grid, D(6))).toHaveAttribute('aria-pressed', 'false');
  await expect(day(grid, D(11))).toHaveAttribute('aria-pressed', 'false');

  // Taking a weekday away removes only its days.
  await weekday(D(5)).click();
  await expect(count).toHaveText('2 days to choose from');
  await expect(day(grid, D(4))).toHaveAttribute('aria-pressed', 'true');
  await expect(day(grid, D(11))).toHaveAttribute('aria-pressed', 'false');
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

test('a link with a made-up organiser key does not replace the real one', async ({
  page,
  request,
}) => {
  const { id, adminToken } = await createEvent(request);
  await page.goto(`/e/${id}#admin=${adminToken}`);
  await expect(
    page.getByRole('heading', { name: 'Organiser tools' })
  ).toBeVisible();

  // A fresh page load, as when the link is opened from a message: from the
  // event page itself, only the fragment would change and nothing reloads.
  await page.goto('/');
  const checked = page.waitForResponse((response) =>
    response.url().endsWith(`/api/events/${id}/admin`)
  );
  await page.goto(`/e/${id}#admin=${'A'.repeat(43)}`);
  expect((await checked).status()).toBe(403);
  expect(new URL(page.url()).hash).toBe('');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Organiser tools' })
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), `owl.admin.${id}`)
  ).toContain(adminToken);
});

test('the tab shows the open event’s emoji once, and the owl elsewhere', async ({
  page,
  request,
}) => {
  const first = await createEvent(request, { title: 'Kick-off' });
  const second = await createEvent(request, {
    title: 'Chess night',
    emoji: 'chess',
  });
  const icon = () => page.locator('link[rel="icon"]').getAttribute('href');
  const decoded = async () => decodeURIComponent((await icon()) ?? '');

  // Both end up in "your events" on this device.
  await page.goto(`/e/${second.id}`);
  await expect(page).toHaveTitle('Chess night · Owl Be There');
  await page.goto(`/e/${first.id}`);
  await expect(page).toHaveTitle('Kick-off · Owl Be There');
  expect(await decoded()).toContain('⚽');

  // From here on the app changes pages without reloading.
  await page.getByRole('link', { name: 'Owl Be There' }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Your events' })
  ).toBeVisible();
  await expect.poll(icon).toBe('/favicon.svg');

  await page.getByRole('link', { name: /Chess night/ }).click();
  await expect(page).toHaveTitle('Chess night · Owl Be There');
  await expect.poll(decoded).toContain('♟');
  expect(await decoded()).not.toContain('⚽');
  await expect(page.locator('link[rel="icon"]')).toHaveCount(1);
});

test('the start page example can be tried, sends nothing, and starts over', async ({
  page,
}, testInfo) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/events'))
      calls.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Try it out' })).toBeVisible();
  const frame = page.locator('[data-browser-frame]');
  await expect(frame.getByText('Team dinner · Owl Be There')).toBeVisible();
  const mine = frame.getByRole('grid', { name: 'My days' });
  const tab = (name: 'My days' | 'Group') =>
    frame.getByRole('tab', { name: new RegExp(`^${name}`) });
  const mobile = isMobile(testInfo);
  if (mobile) await expect(tab('Group')).toBeVisible();
  else await expect(frame.getByRole('tab')).toHaveCount(0);

  // A Monday in the second week: Anna has said nothing about it yet.
  const days = await mine
    .locator('[data-day]')
    .evaluateAll((cells) =>
      cells.map((cell) => cell.getAttribute('data-day')!)
    );
  const monday = days.find(
    (iso) => utcDateOf(iso).getUTCDay() === 1 && Number(iso.slice(8)) >= 8
  )!;
  const canOn = async () => {
    if (mobile) await tab('Group').click();
    const label =
      (await day(
        frame.getByRole('grid', { name: 'Group' }),
        monday
      ).getAttribute('aria-label')) ?? '';
    if (mobile) await tab('My days').click();
    return Number(/(\d+) can/.exec(label)![1]);
  };
  const before = await canOn();

  await day(mine, monday).click();
  await expect.poll(canOn).toBe(before + 1);
  await frame.getByRole('button', { name: 'Start over' }).click();
  await expect.poll(canOn).toBe(before);
  await expect(
    frame.getByRole('button', { name: 'Start over' })
  ).toBeDisabled();
  expect(calls).toEqual([]);
});

test('the start page example speaks the chosen language', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Language').selectOption('de');
  await expect(
    page
      .locator('[data-browser-frame]')
      .getByText('Team-Abendessen · Owl Be There')
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Probier es aus' })
  ).toBeVisible();
});

test('everything clickable shows the hand, and a disabled button does not', async ({
  page,
  request,
}) => {
  const { id } = await createEvent(request, { roster: ['Anna'] });
  const cursor = (locator: Locator) =>
    locator.evaluate((element) => getComputedStyle(element).cursor);

  await page.goto('/');
  expect(
    await cursor(page.getByRole('button', { name: 'Plan an event' }))
  ).toBe('pointer');
  expect(await cursor(page.getByLabel('Language'))).toBe('pointer');
  expect(await cursor(page.getByRole('link').first())).toBe('pointer');

  await page.goto(`/e/${id}`);
  await showView(page, 'mine');
  expect(await cursor(page.getByRole('button', { name: 'Anna' }))).toBe(
    'pointer'
  );
  await page.getByRole('button', { name: 'Anna' }).click();
  expect(await cursor(day(myCalendar(page), D(5)))).toBe('pointer');
  // Nothing to undo yet: the button is disabled and says so.
  const undo = page.getByRole('button', { name: 'Undo' });
  await expect(undo).toBeDisabled();
  expect(await cursor(undo)).toBe('not-allowed');
});

test('a select keeps its shape on focus and draws its own arrow', async ({
  page,
}) => {
  const style = (locator: Locator) =>
    locator.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        focusVisible: element.matches(':focus-visible'),
        radius: computed.borderTopLeftRadius,
        appearance: computed.appearance,
      };
    });

  await page.goto('/');
  for (const name of ['Language', 'Theme']) {
    const select = page.getByLabel(name);
    const before = await style(select);
    expect(before.appearance).toBe('none');
    await select.focus();
    const after = await style(select);
    expect(after.focusVisible).toBe(true);
    expect(after.radius).toBe(before.radius);
    expect(after.radius).not.toBe('8px');
  }

  // Something without a rounding of its own still gets a rounded ring.
  const privacy = page.getByRole('link', { name: 'Privacy' });
  await page.keyboard.press('Tab');
  await privacy.focus();
  expect(await style(privacy)).toMatchObject({
    focusVisible: true,
    radius: '8px',
  });
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
    laptop.getByText('“maxi” is protected. Enter the password to continue.')
  ).toBeVisible();
  await laptop.getByLabel('Password', { exact: true }).fill('wrong!');
  await laptop.getByRole('button', { name: 'Continue' }).click();
  await expect(laptop.getByText('That password is not right.')).toBeVisible();
  await laptop.getByLabel('Password', { exact: true }).fill('secret-1');
  await laptop.getByRole('button', { name: 'Continue' }).click();
  await expect(laptop.getByText('Hi Maxi!')).toBeVisible();
});

test('the organiser removes a password only after confirming it', async ({
  page,
  request,
}) => {
  const { id, adminToken } = await createEvent(request);
  const session = await request.post(`/api/events/${id}/session`, {
    data: { name: 'Maxi', password: 'secret-1' },
  });
  expect(session.status()).toBe(200);
  const protectedEntry = async () =>
    (await snapshot(request, id)).participants[0].hasPassword;

  await page.goto(`/e/${id}#admin=${adminToken}`);
  await page.locator('summary', { hasText: 'People' }).click();
  await page.getByRole('button', { name: 'Remove password' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Anyone with the event link');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(await protectedEntry()).toBe(true);

  await page.getByRole('button', { name: 'Remove password' }).click();
  await dialog.getByRole('button', { name: 'Remove password' }).click();
  await expect.poll(protectedEntry).toBe(false);
});

test('the organiser chooses the best day; everyone gets a calendar file', async ({
  page,
  request,
}) => {
  // Anna is on the roster, so a visitor starts on the list of names, where
  // "Someone else" is the one way to add a new name.
  const { id, adminToken } = await createEvent(request, {
    roster: ['Anna'],
    minCount: 2,
  });
  await answer(request, id, 'Anna', [D(6), D(7)]);
  await answer(request, id, 'Ben', [D(7)], [D(6)]);
  const visit = async () => {
    const visitor = await page.context().browser()!.newPage();
    await visitor.goto(`/e/${id}`);
    await showView(visitor, 'mine');
    // The list of names only: wide screens also show the group view, whose
    // chips carry the same names.
    const names = visitor
      .getByRole('heading', { name: 'your name' })
      .locator('..');
    // A positive anchor first: a count of zero holds just as well while the
    // page is still loading.
    await expect(names.getByRole('button', { name: 'Anna' })).toBeVisible();
    return { visitor, names };
  };

  // While the poll is open, a newcomer may add a name. This is what makes the
  // absence below mean something.
  const early = await visit();
  await expect(
    early.names.getByRole('button', { name: 'Someone else' })
  ).toBeVisible();
  await early.visitor.close();

  await page.goto(`/e/${id}#admin=${adminToken}`);
  await showView(page, 'group');
  const best = page
    .getByRole('listitem')
    .filter({ hasText: '2 of 2 can' })
    .first();
  await expect(best.getByText('enough people')).toBeVisible();
  await best.getByRole('button', { name: 'Choose this date' }).click();

  await expect(page.getByText('The date is set!')).toBeVisible();
  const ics = await request.get(`/api/events/${id}/calendar.ics`);
  expect(ics.status()).toBe(200);
  expect(await ics.text()).toContain(
    `DTSTART;VALUE=DATE:${D(7).replaceAll('-', '')}`
  );
  const data = await snapshot(request, id);
  expect(data.event).toMatchObject({ status: 'finalized', finalStart: D(7) });

  // Nobody new can join, and a participant can no longer change their days.
  const { visitor: other, names } = await visit();
  await expect(names.getByRole('button', { name: 'Someone else' })).toHaveCount(
    0
  );
  await names.getByRole('button', { name: 'Anna' }).click();
  await expect(other.getByText('Hi Anna!')).toBeVisible();
  await expect(myCalendar(other)).toHaveAttribute('aria-readonly', 'true');
  await expect(
    other.getByText('The poll is closed. You can’t change your days now.')
  ).toBeVisible();
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
    page.getByRole('heading', { name: 'We can’t find this event.' })
  ).toBeVisible();
});

test('the privacy page names the operator and the log retention', async ({
  page,
}) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible();
  await expect(page.getByText('Example Organisation')).toBeVisible();
  await expect(
    page.getByText(/These logs are deleted after 7 days/)
  ).toBeVisible();
});

test('the footer links the legal notice between privacy and the source, and the page names the operator', async ({
  page,
}) => {
  await page.goto('/');
  const links = page.getByRole('contentinfo').getByRole('navigation');
  await expect(links.getByRole('link')).toHaveText([
    'Privacy',
    'Imprint',
    'Open source by Willi Thiel',
  ]);
  await links.getByRole('link', { name: 'Imprint' }).click();
  await expect(page).toHaveURL(/\/imprint$/);
  await expect(page.getByRole('heading', { name: 'Imprint' })).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Provider identification under § 5 DDG and § 18(1) MStV',
    })
  ).toBeVisible();
  const provider = page.locator('p').filter({
    hasText: 'Example Organisation',
  });
  await expect(provider.locator('span')).toHaveText([
    'Musterstraße 1',
    '12345 Musterstadt',
    'Germany',
  ]);
  await expect(provider).toContainText('Example Organisation');
  await expect(page.getByText('Email:')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'privacy@example.org' })
  ).toHaveAttribute('href', 'mailto:privacy@example.org');
  await expect(
    page.getByRole('heading', { name: 'About Owl Be There' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Consumer dispute resolution' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Liability for content and links' })
  ).toBeVisible();

  // The address with a slash is the same page; German keeps the statute names.
  await page.goto('/imprint/');
  await page.getByLabel('Language').selectOption('de');
  await expect(
    page.getByRole('heading', {
      name: 'Anbieterkennzeichnung nach § 5 DDG und § 18 Abs. 1 MStV',
    })
  ).toBeVisible();
  await expect(page.getByText('Kontakt', { exact: true })).toBeVisible();
});

test('German is a click away and remembered', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Language').selectOption('de');
  await expect(
    page.getByRole('heading', { name: 'Findet einen Tag, an dem alle können.' })
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Event planen' })
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('de');
});

test('the start page has an address per language, and choosing another follows it', async ({
  page,
}) => {
  await page.goto('/fr');
  await expect(
    page.getByRole('heading', {
      name: 'Trouvez une date qui convient à tout le monde.',
    })
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');

  await page.getByLabel('Langue').selectOption('de');
  await expect(page).toHaveURL(/\/de$/);
  await expect(
    page.getByRole('heading', { name: 'Findet einen Tag, an dem alle können.' })
  ).toBeVisible();

  // The address was a choice: the plain start page keeps it.
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Event planen' })
  ).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test('the start page answers the common questions', async ({ page }) => {
  await page.goto('/en');
  await expect(page.getByRole('heading', { name: 'Questions' })).toBeVisible();
  for (const question of [
    'Does it cost anything?',
    'Do I need an account?',
    'How is it different from Doodle?',
    'Can we look for a whole weekend?',
    'How do I invite the group?',
    'What happens to our data?',
  ])
    await expect(page.getByRole('heading', { name: question })).toBeVisible();
  // One card per feature the start page lists.
  for (const title of ['See what works', 'No accounts'])
    await expect(
      page.getByRole('heading', { name: title, exact: true })
    ).toBeVisible();
  // The text the server wrote for readers without scripts is gone: one page,
  // one main heading.
  await expect(page.locator('[data-static]')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
});

test('without scripts the start page still says what the app is and answers the questions', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/de');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Findet einen Tag, an dem alle können.',
    })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Brauche ich ein Konto?' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Was passiert mit unseren Daten?' })
  ).toBeVisible();
  for (const title of ['Seht, wann es passt', 'Keine Konten'])
    await expect(
      page.getByRole('heading', { name: title, exact: true })
    ).toBeVisible();
  await context.close();
});

test('who has answered is invited to plan their own; the organiser is not', async ({
  browser,
  request,
}) => {
  const { id, adminToken } = await createEvent(request, {
    roster: ['Anna', 'Ben'],
  });
  const invite = (page: Page) => page.getByText('Planning something yourself?');

  const anna = await browser.newPage();
  await anna.goto(`/e/${id}`);
  await showView(anna, 'mine');
  await anna.getByRole('button', { name: 'Anna' }).click();
  await expect(anna.getByText('Hi Anna!')).toBeVisible();
  await expect(invite(anna)).toBeHidden();
  await day(myCalendar(anna), D(5)).click();
  await saved(anna);
  await expect(invite(anna)).toBeVisible();
  // The footer offers the same on every page but the start page.
  await expect(
    anna.locator('footer').getByRole('link', { name: 'Plan an event' })
  ).toBeVisible();
  await anna
    .getByRole('main')
    .getByRole('link', { name: 'Plan an event' })
    .click();
  await expect(anna).toHaveURL(/\/$/);
  await expect(
    anna.locator('footer').getByRole('link', { name: 'Plan an event' })
  ).toHaveCount(0);

  const organiser = await browser.newPage();
  await organiser.goto(`/e/${id}#admin=${adminToken}`);
  await showView(organiser, 'mine');
  await organiser.getByRole('button', { name: 'Ben' }).click();
  await day(myCalendar(organiser), D(6)).click();
  await saved(organiser);
  await expect(invite(organiser)).toBeHidden();
  await anna.close();
  await organiser.close();
});

test('Spanish is remembered and new events use it', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByLabel('Language').selectOption('es');
  await expect(
    page.getByRole('heading', {
      name: 'Encontrad un día que os venga bien a todos.',
    })
  ).toBeVisible();
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('es');
  await page.getByRole('button', { name: 'Planear un evento' }).click();
  await page.getByLabel('Título').fill('Partido en el parque');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Crear evento' }).click();
  await expect(
    page.getByRole('heading', { name: 'Compartir con el grupo' })
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  expect((await snapshot(request, id)).event.language).toBe('es');
});

test('French is remembered and new events use it', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByLabel('Language').selectOption('fr');
  await expect(
    page.getByRole('heading', {
      name: 'Trouvez une date qui convient à tout le monde.',
    })
  ).toBeVisible();
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');
  await page.getByRole('button', { name: 'Organiser un événement' }).click();
  await page.getByLabel('Titre').fill('Foot au parc');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Créer l’événement' }).click();
  await expect(
    page.getByRole('heading', { name: 'Partager avec le groupe' })
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  expect((await snapshot(request, id)).event.language).toBe('fr');
});

test('Portuguese is remembered and new events use it', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByLabel('Language').selectOption('pt');
  await expect(
    page.getByRole('heading', {
      name: 'Encontrem um dia em que todos possam.',
    })
  ).toBeVisible();
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('pt');
  await page.getByRole('button', { name: 'Planear um evento' }).click();
  await page.getByLabel('Título').fill('Jogo no parque');
  await page.getByRole('button', { name: 'Seguinte' }).click();
  await page.getByRole('button', { name: 'Seguinte' }).click();
  await page.getByRole('button', { name: 'Criar evento' }).click();
  await expect(
    page.getByRole('heading', { name: 'Partilhar com o grupo' })
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  expect((await snapshot(request, id)).event.language).toBe('pt');
});

test('Italian is remembered and new events use it', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByLabel('Language').selectOption('it');
  await expect(
    page.getByRole('heading', {
      name: 'Trova un giorno che vada bene a tutti.',
    })
  ).toBeVisible();
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('it');
  await page.getByRole('button', { name: 'Organizza un evento' }).click();
  await page.getByLabel('Titolo').fill('Partita al parco');
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: 'Crea evento' }).click();
  await expect(
    page.getByRole('heading', { name: 'Condividi con il gruppo' })
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  expect((await snapshot(request, id)).event.language).toBe('it');
});

test('Japanese is remembered and new events use it', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByLabel('Language').selectOption('ja');
  await expect(
    page.getByRole('heading', {
      name: 'みんなが集まれる日を見つけよう。',
    })
  ).toBeVisible();
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('ja');
  expect(
    await page.evaluate(async () => {
      const faces = await document.fonts.load(
        '16px "Noto Sans CJK JP UI"',
        'みんな'
      );
      return faces.some(
        (face) =>
          face.family === 'Noto Sans CJK JP UI' && face.status === 'loaded'
      );
    })
  ).toBe(true);
  await page.getByRole('button', { name: '予定を立てる' }).click();
  await page.getByLabel('タイトル').fill('公園でサッカー');
  await page.getByRole('button', { name: '次へ' }).click();
  await page.getByRole('button', { name: '次へ' }).click();
  await page.getByRole('button', { name: '予定を作る' }).click();
  await expect(
    page.getByRole('heading', { name: 'みんなに共有' })
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  expect((await snapshot(request, id)).event.language).toBe('ja');
});

test('Dutch is remembered and new events use it', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Language').selectOption('nl');
  await expect(
    page.getByRole('heading', { name: 'Vind een dag waarop iedereen kan.' })
  ).toBeVisible();
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('nl');
  await page.getByRole('button', { name: 'Plan een evenement' }).click();
  await page.getByLabel('Titel').fill('Voetbal in het park');
  await page.getByRole('button', { name: 'Volgende' }).click();
  await page.getByRole('button', { name: 'Volgende' }).click();
  await page.getByRole('button', { name: 'Evenement maken' }).click();
  await expect(
    page.getByRole('heading', { name: 'Deel met je groep' })
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  expect((await snapshot(request, id)).event.language).toBe('nl');
});

test('the count of answers is spelled out and follows live', async ({
  page,
  request,
}) => {
  const { id } = await createEvent(request);
  await answer(request, id, 'Anna', [D(6)]);
  await page.goto(`/e/${id}`);
  await expect(page.locator('main')).toContainText('1 answer');
  await answer(request, id, 'Ben', [D(6)]);
  await expect(page.locator('main')).toContainText('2 answers', {
    timeout: 10_000,
  });
});

test('forgetting an event with an organiser key on this device asks first', async ({
  page,
  request,
}) => {
  const { id, adminToken } = await createEvent(request, {
    title: 'Garden party',
  });
  await page.goto(`/e/${id}#admin=${adminToken}`);
  await expect(
    page.getByRole('heading', { name: 'Organiser tools' })
  ).toBeVisible();
  await page.goto('/');
  const forget = page.getByRole('button', {
    name: 'Remove Garden party from this list',
  });
  const stored = () =>
    page.evaluate((key) => localStorage.getItem(key), `owl.admin.${id}`);

  // Cancelling keeps the entry and the key.
  await forget.click();
  const dialog = page.getByRole('dialog', {
    name: 'Remove this event from this device?',
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('organiser link');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(forget).toBeVisible();
  expect(await stored()).toContain(adminToken);

  // Confirming removes both.
  await forget.click();
  await dialog.getByRole('button', { name: 'Remove from this device' }).click();
  await expect(forget).toHaveCount(0);
  expect(await stored()).toBeNull();
});

test('forgetting an event without an organiser key takes one tap', async ({
  page,
  request,
}) => {
  const { id } = await createEvent(request, { title: 'Book club' });
  await page.goto(`/e/${id}`);
  await expect(page.getByRole('heading', { name: 'Book club' })).toBeVisible();
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Remove Book club from this list' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Remove Book club from this list' })
  ).toHaveCount(0);
});

const ADMIN_REFUSED = 'This organiser link was not accepted.';
const MADE_UP_KEY = 'A'.repeat(43);

/** Pastes an organiser link's fragment into the open page. */
async function pasteOrganiserKey(page: Page, key: string): Promise<void> {
  await page.evaluate((value) => {
    window.location.hash = `#admin=${value}`;
  }, key);
}

/**
 * Opens an event with a made-up organiser key, which a link whose key passes
 * the fragment check can leave on the device, and has the server refuse it.
 */
async function getRefused(page: Page, id: string): Promise<void> {
  await page.goto(`/e/${id}#admin=${MADE_UP_KEY}`);
  const days = await openSection(page, 'Days');
  await days.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(ADMIN_REFUSED)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Organiser tools' })
  ).toHaveCount(0);
}

test('an organiser link pasted into the open event page is taken and removed from the address', async ({
  page,
  request,
}) => {
  const { id, adminToken } = await createEvent(request);
  await page.goto(`/e/${id}`);
  await expect(
    page.getByRole('heading', { name: 'Organiser tools' })
  ).toHaveCount(0);
  await page.evaluate((key) => {
    window.location.hash = `#admin=${key}`;
  }, adminToken);
  await expect(
    page.getByRole('heading', { name: 'Organiser tools' })
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  expect(
    await page.evaluate((key) => localStorage.getItem(key), `owl.admin.${id}`)
  ).toContain(adminToken);
  // Nothing was refused before, so there is nothing to take back.
  await expect(page.getByText(ADMIN_REFUSED)).toHaveCount(0);
});

test('the refused-link notice goes away when the complete link is pasted into the open page', async ({
  page,
  request,
}) => {
  const { id, adminToken } = await createEvent(request);
  await getRefused(page, id);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), `owl.admin.${id}`)
  ).toBeNull();

  await pasteOrganiserKey(page, adminToken);
  await expect(
    page.getByRole('heading', { name: 'Organiser tools' })
  ).toBeVisible();
  await expect(page.getByText(ADMIN_REFUSED)).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('');
  expect(
    await page.evaluate((key) => localStorage.getItem(key), `owl.admin.${id}`)
  ).toContain(adminToken);

  // The tools work again, and the notice does not come back with them.
  const days = await openSection(page, 'Days');
  await days.getByRole('button', { name: 'Save' }).click();
  await expect(days.getByText('Saved')).toBeVisible();
  await expect(page.getByText(ADMIN_REFUSED)).toHaveCount(0);
});

test('a refused link pasted again keeps the notice, and a link that is no key does not take it back', async ({
  page,
  request,
}) => {
  const { id, adminToken } = await createEvent(request);
  const other = await createEvent(request, { title: 'Chess night' });
  await getRefused(page, id);

  // Too short to be a key: nothing is stored, the notice stays.
  await pasteOrganiserKey(page, 'short');
  await expect.poll(() => new URL(page.url()).hash).toBe('');
  await expect(page.getByText(ADMIN_REFUSED)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Organiser tools' })
  ).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), `owl.admin.${id}`)
  ).toBeNull();

  // Another key that is not this event's, one of another event included: the
  // tools return for a moment, are refused again, and the notice with them.
  for (const key of ['B'.repeat(43), other.adminToken]) {
    await pasteOrganiserKey(page, key);
    await expect(
      page.getByRole('heading', { name: 'Organiser tools' })
    ).toBeVisible();
    await expect(page.getByText(ADMIN_REFUSED)).toHaveCount(0);
    const days = await openSection(page, 'Days');
    await days.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(ADMIN_REFUSED)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Organiser tools' })
    ).toHaveCount(0);
  }

  // The complete link then clears it for good.
  await pasteOrganiserKey(page, adminToken);
  await expect(
    page.getByRole('heading', { name: 'Organiser tools' })
  ).toBeVisible();
  await expect(page.getByText(ADMIN_REFUSED)).toHaveCount(0);
});

test('another event’s organiser link opens that event only; the notice stays out of it', async ({
  page,
  request,
}) => {
  const { id } = await createEvent(request);
  const other = await createEvent(request, { title: 'Chess night' });
  await getRefused(page, id);

  // A fresh page load, as when the link is opened from a message.
  await page.goto(`/e/${other.id}#admin=${other.adminToken}`);
  await expect(
    page.getByRole('heading', { name: 'Organiser tools' })
  ).toBeVisible();
  await expect(page.getByText(ADMIN_REFUSED)).toHaveCount(0);

  // The first event got no key from it.
  await page.goto(`/e/${id}`);
  await expect(
    page.getByRole('heading', { name: 'Summer tournament' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Organiser tools' })
  ).toHaveCount(0);
  await expect(page.getByText(ADMIN_REFUSED)).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), `owl.admin.${id}`)
  ).toBeNull();
});

/** One of the organiser's sections, opened. */
async function openSection(page: Page, title: string): Promise<Locator> {
  const section = page.locator('details').filter({
    has: page.locator('summary', { hasText: title }),
  });
  await section.locator('summary').click();
  return section;
}

test('the days editor saves only the days its calendar shows', async ({
  page,
  request,
}) => {
  const { id, adminToken } = await createEvent(request, {
    days: [D(3), D(4), D(5)],
  });
  await page.goto(`/e/${id}#admin=${adminToken}`);
  const section = await openSection(page, 'Days');
  const until = section.getByLabel('Add days up to');
  // A far date typed first, then corrected to a near one: the days in between
  // that are no longer shown must not be saved.
  await until.fill(D(40));
  await until.fill(D(8));
  await section.getByRole('button', { name: 'Save' }).click();
  await expect(section.getByText('Saved')).toBeVisible();
  expect((await snapshot(request, id)).event.days).toEqual(
    [3, 4, 5, 6, 7, 8].map(D)
  );
});

test('a day switched off in the days editor stays off when the end date moves on', async ({
  page,
  request,
}) => {
  const { id, adminToken } = await createEvent(request, {
    days: [D(3), D(4), D(5)],
  });
  await page.goto(`/e/${id}#admin=${adminToken}`);
  const section = await openSection(page, 'Days');
  const grid = section.getByRole('grid');
  const until = section.getByLabel('Add days up to');
  await until.fill(D(8));
  await expect(day(grid, D(6))).toHaveAttribute('aria-pressed', 'true');
  await day(grid, D(6)).click();
  await expect(day(grid, D(6))).toHaveAttribute('aria-pressed', 'false');

  // Further, back to a date still past the last day, and the same date again:
  // the day stays off and the others follow the date.
  await until.fill(D(10));
  await expect(day(grid, D(10))).toHaveAttribute('aria-pressed', 'true');
  await expect(day(grid, D(6))).toHaveAttribute('aria-pressed', 'false');
  await until.fill(D(7));
  await expect(day(grid, D(6))).toHaveAttribute('aria-pressed', 'false');
  await expect(day(grid, D(7))).toHaveAttribute('aria-pressed', 'true');
  await until.fill(D(9));
  await expect(day(grid, D(6))).toHaveAttribute('aria-pressed', 'false');
  await expect(day(grid, D(8))).toHaveAttribute('aria-pressed', 'true');
  await expect(day(grid, D(9))).toHaveAttribute('aria-pressed', 'true');
  await section.getByRole('button', { name: 'Save' }).click();
  await expect(section.getByText('Saved')).toBeVisible();
  expect((await snapshot(request, id)).event.days).toEqual(
    [3, 4, 5, 7, 8, 9].map(D)
  );
});

test('saving days or a duration that takes answers or the date away asks first', async ({
  page,
  request,
}) => {
  const { id, adminToken } = await createEvent(request, {
    days: [3, 4, 5, 6, 7, 8].map(D),
    durationDays: 3,
  });
  await answer(request, id, 'Anna', [D(7), D(8)]);
  const response = await request.put(`/api/events/${id}/status`, {
    headers: { 'x-admin-token': adminToken },
    data: { status: 'finalized', start: D(3) },
  });
  expect(response.status()).toBe(200);
  const current = async () => (await snapshot(request, id)).event;
  const dialog = page.getByRole('dialog');

  await page.goto(`/e/${id}#admin=${adminToken}`);
  const days = await openSection(page, 'Days');
  await day(days.getByRole('grid'), D(8)).click();
  await days.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toContainText('deletes 1 answer');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect((await current()).days).toHaveLength(6);
  const annasDays = async () => {
    const [anna] = (await snapshot(request, id)).participants;
    return anna.yes;
  };
  expect(await annasDays()).toEqual([D(7), D(8)]);

  await days.getByRole('button', { name: 'Save' }).click();
  await dialog.getByRole('button', { name: 'Save anyway' }).click();
  await expect.poll(async () => (await current()).days).toHaveLength(5);
  expect(await annasDays()).toEqual([D(7)]);

  // A day without answers goes without a question.
  await day(days.getByRole('grid'), D(6)).click();
  await days.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await current()).days).toHaveLength(4);

  // A shorter duration cuts the chosen date short.
  const details = await openSection(page, 'Details');
  await details.getByLabel('Days in a row').fill('2');
  await details.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toContainText('The chosen date becomes shorter');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect((await current()).durationDays).toBe(3);
  await details.getByRole('button', { name: 'Save' }).click();
  await dialog.getByRole('button', { name: 'Save anyway' }).click();
  await expect.poll(async () => (await current()).durationDays).toBe(2);
  expect((await current()).finalEnd).toBe(D(4));
});

const HOME_TITLE = 'Owl Be There — Find a day everyone can make.';

test('a keyboard user who follows a footer link lands in the page, which names the tab', async ({
  page,
  request,
}, testInfo) => {
  test.skip(isMobile(testInfo), 'keyboards are a desktop thing');
  const { id } = await createEvent(request, { title: 'Chess club' });
  const main = page.locator('main');
  const footer = page.getByRole('contentinfo').getByRole('navigation');
  const scrollY = () => page.evaluate(() => window.scrollY);

  // A fresh load leaves focus where the browser puts it.
  await page.goto('/');
  await expect(page).toHaveTitle(HOME_TITLE);
  expect(
    await page.evaluate(() => document.activeElement === document.body)
  ).toBe(true);

  const privacy = footer.getByRole('link', { name: 'Privacy' });
  await privacy.focus();
  await expect.poll(scrollY).toBeGreaterThan(0);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(main).toBeFocused();
  await expect(page).toHaveTitle('Privacy · Owl Be There');
  await expect.poll(scrollY).toBe(0);

  // Back and Forward are page changes too.
  await privacy.focus();
  await page.goBack();
  await expect(page).toHaveTitle(HOME_TITLE);
  await expect(main).toBeFocused();
  await privacy.focus();
  await page.goForward();
  await expect(page).toHaveTitle('Privacy · Owl Be There');
  await expect(main).toBeFocused();

  const imprint = footer.getByRole('link', { name: 'Imprint' });
  await imprint.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveTitle('Imprint · Owl Be There');
  await expect(main).toBeFocused();

  // An event keeps its own title, and the way back to it gives it again.
  await page.goto(`/e/${id}`);
  await expect(page).toHaveTitle('Chess club · Owl Be There');
  await privacy.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveTitle('Privacy · Owl Be There');
  await privacy.focus();
  await page.goBack();
  await expect(page).toHaveTitle('Chess club · Owl Be There');
  await expect(main).toBeFocused();

  // An unknown address has a title of its own, and a load steals no focus.
  await page.goto('/nowhere');
  await expect(page).toHaveTitle('We can’t find this page. · Owl Be There');
  expect(
    await page.evaluate(() => document.activeElement === document.body)
  ).toBe(true);
});

test('choosing another language on the same page keeps focus and renames the tab', async ({
  page,
}, testInfo) => {
  test.skip(isMobile(testInfo), 'keyboards are a desktop thing');
  await page.goto('/privacy');
  const language = page.getByLabel('Language');
  await language.focus();
  await language.selectOption('de');
  await expect(page).toHaveTitle('Datenschutz · Owl Be There');
  await expect(language).toBeFocused();

  await page.goto('/nowhere');
  await page.getByLabel('Sprache').selectOption('en');
  await expect(page).toHaveTitle('We can’t find this page. · Owl Be There');

  // The start page moves between addresses without taking focus.
  await page.goto('/de');
  const select = page.getByLabel('Sprache');
  await select.focus();
  await select.selectOption('fr');
  await expect(page).toHaveURL(/\/fr$/);
  await expect(page.getByLabel('Langue')).toBeFocused();
});

test('a dialog that opens on arrival keeps focus, and closing it without an opener lands in the page', async ({
  page,
}, testInfo) => {
  test.skip(isMobile(testInfo), 'keyboards are a desktop thing');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Plan an event' }).click();
  await page.getByLabel('Title').fill('Pub quiz');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Saturday', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Create event' }).click();

  // The share sheet opens with the new page; the page's own focus move must
  // not pull focus out of it.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('main')).toBeFocused();
  expect(errors).toEqual([]);
});

/** Opens each event as its organiser, so the start page lists it as its own. */
async function ownEvents(
  page: Page,
  request: Parameters<typeof createEvent>[0],
  titles: string[]
): Promise<void> {
  for (const title of titles) {
    const { id, adminToken } = await createEvent(request, { title });
    await page.goto(`/e/${id}#admin=${adminToken}`);
    await expect(
      page.getByRole('heading', { name: 'Organiser tools' })
    ).toBeVisible();
  }
}

test('removing an event from the start page by keyboard never drops focus on the body', async ({
  page,
  request,
}, testInfo) => {
  test.skip(isMobile(testInfo), 'keyboards are a desktop thing');
  await ownEvents(page, request, ['Alpha', 'Beta', 'Gamma']);
  await page.goto('/');
  const remove = (title: string) =>
    page.getByRole('button', { name: `Remove ${title} from this list` });
  const dialog = page.getByRole('dialog');
  const links = page.locator('main li > a');
  const open = async (title: string) => {
    await remove(title).focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
  };
  const confirm = async () => {
    await dialog
      .getByRole('button', { name: 'Remove from this device' })
      .focus();
    await page.keyboard.press('Enter');
  };

  // Cancel and Escape give focus back to the button that opened the dialog.
  await open('Beta');
  await dialog.getByRole('button', { name: 'Cancel' }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(remove('Beta')).toBeFocused();
  await open('Beta');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(remove('Beta')).toBeFocused();

  // Confirming removes the opener: focus moves to the entry in its place.
  const before = await links.allTextContents();
  const index = before.findIndex((text) => text.includes('Beta'));
  await open('Beta');
  await confirm();
  await expect(remove('Beta')).toHaveCount(0);
  const after = before.filter((_, at) => at !== index);
  const expected = after[Math.min(index, after.length - 1)]!.includes('Alpha')
    ? 'Alpha'
    : 'Gamma';
  await expect(page.locator('main li > a:focus')).toContainText(expected);

  // The last entry hands focus to the one before it; with none left, to main.
  await open('Alpha');
  await confirm();
  await expect(remove('Alpha')).toHaveCount(0);
  await expect(page.locator('main li > a:focus')).toContainText('Gamma');
  await open('Gamma');
  await confirm();
  await expect(links).toHaveCount(0);
  await expect(page.locator('main')).toBeFocused();
});

test('confirming a save that costs answers moves focus into the organiser panel, and cancelling returns to Save', async ({
  page,
  request,
}, testInfo) => {
  test.skip(isMobile(testInfo), 'keyboards are a desktop thing');
  const { id, adminToken } = await createEvent(request, {
    days: [3, 4, 5, 6, 7, 8].map(D),
    durationDays: 3,
  });
  await answer(request, id, 'Anna', [D(7), D(8)]);
  const chosen = await request.put(`/api/events/${id}/status`, {
    headers: { 'x-admin-token': adminToken },
    data: { status: 'finalized', start: D(3) },
  });
  expect(chosen.status()).toBe(200);
  const current = async () => (await snapshot(request, id)).event;
  const dialog = page.getByRole('dialog');
  const panel = page.getByRole('heading', { name: 'Organiser tools' });
  await page.goto(`/e/${id}#admin=${adminToken}`);

  // Days: switch the last day off, which deletes Anna's answer for it.
  const days = await openSection(page, 'Days');
  await day(days.getByRole('grid'), D(8)).click();
  const saveDays = days.getByRole('button', { name: 'Save' });
  await saveDays.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toContainText('deletes 1 answer');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(saveDays).toBeFocused();
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Cancel' }).focus();
  await page.keyboard.press('Enter');
  await expect(saveDays).toBeFocused();
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Save anyway' }).focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeFocused();
  await expect.poll(async () => (await current()).days).toHaveLength(5);

  // Details: a shorter duration.
  const details = await openSection(page, 'Details');
  await details.getByLabel('Days in a row').fill('2');
  const saveDetails = details.getByRole('button', { name: 'Save' });
  await saveDetails.focus();
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Cancel' }).focus();
  await page.keyboard.press('Enter');
  await expect(saveDetails).toBeFocused();
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Save anyway' }).focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeFocused();
  await expect.poll(async () => (await current()).durationDays).toBe(2);

  // The dialogs of the people list still return to the row's own button.
  const people = await openSection(page, 'People');
  const remove = people.getByRole('button', { name: 'Remove', exact: true });
  await remove.focus();
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Cancel' }).focus();
  await page.keyboard.press('Enter');
  await expect(remove).toBeFocused();
});
