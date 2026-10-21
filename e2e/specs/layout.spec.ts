import { expect, test, type Page } from '@playwright/test';
import { LANGUAGES } from '@owl/shared';
import {
  answer,
  createEvent,
  dayFromNow,
  expectLangAndDir,
  expectNoHorizontalOverflow,
  expectNoRawKeys,
  watchFullCjkFonts,
} from '../helpers.ts';

// Every language on a phone and on a desktop: nothing sticks out sideways, no
// text is a dictionary key that was never looked up, and the page declares its
// language and direction. Chromium only; the check is about texts, not engines.

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

    const { id, adminToken } = await createEvent(request, { language });
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

    // The group view: the second tab on a phone.
    const tabs = page.getByRole('tab');
    if (await tabs.first().isVisible()) await tabs.nth(1).click();
    await expect(
      page.locator('[role="grid"]:visible [data-day]').first()
    ).toBeVisible();
    await check(page, language, `/e/${id} group`);

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
