import { expect, test, type Page } from '@playwright/test';
import { LANGUAGES } from '@owl/shared';
import {
  answer,
  createEvent,
  dayFromNow,
  daysFromNow,
  expectLangAndDir,
  expectNoHorizontalOverflow,
  expectNoRawKeys,
  watchFullCjkFonts,
} from '../helpers.ts';

// Every language on a phone and on a desktop: nothing sticks out sideways, no
// text is a dictionary key that was never looked up, and the page declares its
// language and direction. Chromium only; the check is about texts, not engines.

/**
 * The calendar's row header (month and week) and weekday headings: no label is
 * cut off or spills out of its column, and no two weekday names touch.
 */
async function expectCalendarHeadersFit(page: Page, where: string) {
  const problems = await page.evaluate(() => {
    const grid = [...document.querySelectorAll('[role="grid"]')].find(
      (element) => (element as HTMLElement).offsetParent !== null
    );
    if (!grid) return ['no calendar'];
    const found: string[] = [];
    for (const label of grid.querySelectorAll<HTMLElement>('.cal-rowtext')) {
      const style = getComputedStyle(label);
      const box = label.getBoundingClientRect();
      const head = label.closest('.cal-rowhead')!.getBoundingClientRect();
      if (style.textOverflow === 'ellipsis' && style.overflow !== 'visible')
        found.push(`"${label.textContent}" can be ellipsised`);
      if (label.scrollWidth > label.clientWidth)
        found.push(`"${label.textContent}" is cut off`);
      if (box.left < head.left - 0.5 || box.right > head.right + 0.5)
        found.push(`"${label.textContent}" leaves its column`);
    }
    const range = document.createRange();
    const names = [...grid.querySelectorAll('.cal-head [role="columnheader"]')]
      .filter((header) => header.textContent)
      .map((header) => {
        range.selectNodeContents(header);
        return { text: header.textContent, box: range.getBoundingClientRect() };
      });
    for (let index = 1; index < names.length; index += 1) {
      const a = names[index - 1]!.box;
      const b = names[index]!.box;
      if (a.left < b.right - 0.1 && b.left < a.right - 0.1)
        found.push(
          `"${names[index - 1]!.text}" touches "${names[index]!.text}"`
        );
    }
    return found;
  });
  expect(problems, `calendar headings in ${where}`).toEqual([]);
}

async function check(page: Page, language: string, where: string) {
  await page.evaluate(() => document.fonts.ready);
  await expectLangAndDir(page, language, where);
  await expectNoHorizontalOverflow(page, where);
  await expectNoRawKeys(page, where);
}

for (const language of LANGUAGES) {
  test(`the pages in ${language} fit the screen and show no raw keys`, async ({
    page,
    request,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== 'chromium', 'texts, not engines: Chromium only');
    if (testInfo.project.use.hasTouch)
      await page.setViewportSize({ width: 360, height: 740 });
    const fonts = watchFullCjkFonts(page);

    await page.goto(`/${language}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await check(page, language, `/${language}`);

    // Half a year: every month's name and weeks of one and two digits.
    const { id, adminToken } = await createEvent(request, {
      language,
      days: daysFromNow(3, 188),
    });
    await answer(request, id, 'Anna', [dayFromNow(5), dayFromNow(6)]);
    await answer(request, id, 'Ben', [dayFromNow(5)], [dayFromNow(6)]);
    await answer(request, id, 'Cem', [dayFromNow(6), dayFromNow(7)]);

    // My days, after joining: the first tab on a phone, the left column on a desktop.
    await page.goto(`/e/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const joined = page.waitForResponse((response) =>
      response.url().endsWith(`/api/events/${id}/session`)
    );
    await page.locator('main input').first().fill('Dana');
    await page.locator('main input').first().press('Enter');
    expect((await joined).status()).toBe(200);
    await expect(
      page.locator('[role="grid"]:visible [data-day]').first()
    ).toBeVisible();
    await check(page, language, `/e/${id} my days`);
    await expectCalendarHeadersFit(page, `/e/${id} my days`);

    // The group view: the second tab on a phone.
    const tabs = page.getByRole('tab');
    if (await tabs.first().isVisible()) await tabs.nth(1).click();
    await expect(
      page.locator('[role="grid"]:visible [data-day]').first()
    ).toBeVisible();
    await check(page, language, `/e/${id} group`);
    await expectCalendarHeadersFit(page, `/e/${id} group`);

    // The organiser panel with every section open.
    await page.goto(`/e/${id}#admin=${adminToken}`);
    const sections = page.locator('details > summary');
    await expect(sections.first()).toBeVisible();
    for (const summary of await sections.all()) await summary.click();
    await check(page, language, `/e/${id} organiser`);

    if (language === 'ja' || language === 'zh-Hans')
      expect(fonts, 'the full CJK fonts are not requested').toEqual([]);
  });
}

// A finger needs 24 by 24 CSS pixels (WCAG 2.5.8): the calendar's week
// buttons, the footer links and the checkbox of the name form.
test('week buttons, footer links and the password checkbox are 24 pixels on a phone', async ({
  page,
  request,
}, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'touch targets: phones only');
  await page.setViewportSize({ width: 320, height: 700 });
  const { id } = await createEvent(request);
  await page.goto(`/e/${id}`);
  const protect = page.getByRole('checkbox');
  await expect(protect).toBeVisible();
  const checkbox = await protect.boundingBox();
  expect(checkbox!.width).toBeGreaterThanOrEqual(24);
  expect(checkbox!.height).toBeGreaterThanOrEqual(24);

  await page.locator('main input').first().fill('Dana');
  await page.locator('main input').first().press('Enter');
  await expect(
    page.locator('[role="grid"]:visible [data-day]').first()
  ).toBeVisible();
  const [count, small] = await page.evaluate(() => {
    const targets = [
      ...document.querySelectorAll('[role="grid"] .cal-rowhead button'),
      ...document.querySelectorAll('footer nav a'),
    ];
    const tooSmall = targets
      .map((target) => ({
        name: target.textContent,
        box: target.getBoundingClientRect(),
      }))
      .filter(({ box }) => box.width < 24 || box.height < 24)
      .map(({ name, box }) => `${name}: ${box.width}x${box.height}`);
    return [targets.length, tooSmall] as const;
  });
  expect(count).toBeGreaterThan(5);
  expect(small).toEqual([]);
  await expectNoHorizontalOverflow(page, 'a 320 pixel phone');
});

// `overflow-wrap: anywhere` made ordinary words break in the middle once the
// share button took its half of a phone's width; the title now gets the row.
test('a normal title breaks between words, a long one still wraps', async ({
  page,
  request,
}, testInfo) => {
  if (testInfo.project.use.hasTouch)
    await page.setViewportSize({ width: 360, height: 740 });
  const long = `Supercalifragilistic${'x'.repeat(60)}`;
  const brokenWords = async (title: string) => {
    const { id } = await createEvent(request, { title });
    await page.goto(`/e/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    return page.evaluate(() => {
      const heading = document.querySelector('header h1 span:last-child')!;
      const text = heading.firstChild!;
      const range = document.createRange();
      const broken: string[] = [];
      for (const word of heading.textContent!.matchAll(/\S+/g)) {
        range.setStart(text, word.index);
        range.setEnd(text, word.index + word[0].length);
        const lines = new Set(
          [...range.getClientRects()].map((rect) => Math.round(rect.top))
        );
        if (lines.size > 1) broken.push(word[0]);
      }
      return broken;
    });
  };
  expect(await brokenWords('Summer tournament of the neighbourhood')).toEqual(
    []
  );
  await expectNoHorizontalOverflow(page, 'a normal title');
  expect(await brokenWords(long)).toEqual([long]);
  await expectNoHorizontalOverflow(page, 'a long unbroken title');
});

// A grid track sized `auto` grows to its longest word, so a remembered event
// with one long unbroken word pushed the start page wider than a phone.
test('a remembered event with a long unbroken title fits a phone', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'phone width: touch projects only');
  await page.setViewportSize({ width: 360, height: 740 });
  await page.addInitScript(() => {
    localStorage.setItem(
      'owl.events',
      JSON.stringify([
        {
          id: '3Hk9TqXw5RdE',
          title: 'Chess night',
          emoji: 'soccer',
          role: 'participant',
        },
        {
          id: 'Cm4Pz8WnJ2yA',
          title:
            'Garden party Donaudampfschifffahrtsgesellschaftskapitaensmuetze',
          emoji: 'drinks',
          role: 'organiser',
        },
      ])
    );
  });
  await page.goto('/en');
  await expect(page.getByRole('link', { name: /Chess night/ })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'the start page with a long title');
});
