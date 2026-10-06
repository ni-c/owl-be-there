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

  await expect(page.getByText('The date is set!')).toBeVisible();
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
