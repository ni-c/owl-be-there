import { expect, test, type Locator } from '@playwright/test';
import {
  answer,
  createEvent,
  day,
  dayFromNow,
  groupCalendar,
  isMobile,
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
  await expect(
    page.getByRole('heading', { name: 'See how it looks' })
  ).toBeVisible();
  const frame = page.locator('[data-browser-frame]');
  await expect(frame.getByText('Team dinner · Owl Be There')).toBeVisible();
  const mine = frame.getByRole('grid', { name: 'My days' });
  const tab = (name: 'My days' | 'Everyone') =>
    frame.getByRole('tab', { name: new RegExp(`^${name}`) });
  const mobile = isMobile(testInfo);
  if (mobile) await expect(tab('Everyone')).toBeVisible();
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
    if (mobile) await tab('Everyone').click();
    const label =
      (await day(
        frame.getByRole('grid', { name: 'Everyone' }),
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
    page.getByRole('heading', { name: 'So sieht es aus' })
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
