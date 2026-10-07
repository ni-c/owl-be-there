import { expect, test } from '@playwright/test';
import {
  createEvent,
  day,
  dayFromNow,
  daysFromNow,
  isMobile,
  joinAs,
  myCalendar,
  saved,
  snapshot,
  utcDateOf,
} from '../helpers.ts';
import { drag, touchSwipeUp } from '../touch.ts';

const D = (offset: number) => dayFromNow(offset);

/**
 * The first offset from 3 to 8 that falls on a Tuesday or a Wednesday.
 *
 * Neither is the last column of a week that starts on Saturday, Sunday or
 * Monday, so the day after it is always in the same row — and the six offsets
 * always contain one of the two. Ending at 8 keeps offset + 8 inside the
 * candidate days `createEvent` sets up (3 to 16).
 */
function midWeekOffset(): number {
  const offset = [3, 4, 5, 6, 7, 8].find((o) =>
    [2, 3].includes(utcDateOf(D(o)).getUTCDay())
  );
  if (offset === undefined)
    throw new Error('no Tuesday or Wednesday in six days');
  return offset;
}

async function myMarks(
  request: Parameters<typeof snapshot>[0],
  id: string,
  name: string
) {
  const data = await snapshot(request, id);
  const me = data.participants.find((p: { name: string }) => p.name === name);
  return {
    yes: me.yes as string[],
    maybe: me.maybe as string[],
    answered: me.answered as boolean,
  };
}

test.describe('painting days', () => {
  test('a tap switches a day on, a second tap off again', async ({
    page,
    request,
  }) => {
    const { id } = await createEvent(request);
    await page.goto(`/e/${id}`);
    await joinAs(page, 'Anna');
    const cell = day(myCalendar(page), D(4));
    await cell.click();
    await expect(cell).toHaveAttribute('data-state', 'yes');
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    await saved(page);
    expect((await myMarks(request, id, 'Anna')).yes).toEqual([D(4)]);
    await cell.click();
    await expect(cell).toHaveAttribute('data-state', 'none');
    await expect
      .poll(async () => (await myMarks(request, id, 'Anna')).yes)
      .toEqual([]);
  });

  test('a drag marks the rectangle it spans, and a drag from a marked day erases it', async ({
    page,
    request,
  }, testInfo) => {
    const { id } = await createEvent(request);
    await page.goto(`/e/${id}`);
    await joinAs(page, 'Ben');
    const grid = myCalendar(page);
    // A 2 × 2 block needs its first day and the next one in the same row. The
    // offsets used to be fixed (4, 5, 11, 12), which put the block across a
    // week break whenever D(4) was the last column — every Wednesday with
    // weeks starting on Monday — and the drag rightly marked whole weeks.
    const m = midWeekOffset();
    await drag(page, day(grid, D(m)), day(grid, D(m + 8)), testInfo);
    for (const offset of [m, m + 1, m + 7, m + 8]) {
      await expect(day(grid, D(offset))).toHaveAttribute('data-state', 'yes');
    }
    await expect(day(grid, D(m + 2))).toHaveAttribute('data-state', 'none');
    await expect
      .poll(async () => (await myMarks(request, id, 'Ben')).yes)
      .toEqual([D(m), D(m + 1), D(m + 7), D(m + 8)]);

    // Upwards and to the left this time, starting on a marked day: erases.
    await drag(page, day(grid, D(m + 8)), day(grid, D(m + 1)), testInfo);
    await expect(day(grid, D(m + 1))).toHaveAttribute('data-state', 'none');
    await expect(day(grid, D(m + 8))).toHaveAttribute('data-state', 'none');
    await expect(day(grid, D(m))).toHaveAttribute('data-state', 'yes');
    await expect
      .poll(async () => (await myMarks(request, id, 'Ben')).yes)
      .toEqual([D(m), D(m + 7)]);
  });

  test('the maybe brush, undo, and the weekday header', async ({
    page,
    request,
  }) => {
    const { id } = await createEvent(request);
    await page.goto(`/e/${id}`);
    await joinAs(page, 'Cem');
    const grid = myCalendar(page);
    await page.getByRole('radio', { name: 'Maybe' }).click();
    await day(grid, D(6)).click();
    await expect(day(grid, D(6))).toHaveAttribute('data-state', 'maybe');
    await expect(day(grid, D(6))).toHaveAttribute('aria-pressed', 'mixed');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(day(grid, D(6))).toHaveAttribute('data-state', 'none');

    await page.getByRole('radio', { name: 'Can' }).click();
    const weekday = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(utcDateOf(D(6)));
    await page.getByRole('button', { name: `All ${weekday}s` }).click();
    await expect(day(grid, D(6))).toHaveAttribute('data-state', 'yes');
    await expect(day(grid, D(13))).toHaveAttribute('data-state', 'yes');
    await expect
      .poll(async () => (await myMarks(request, id, 'Cem')).yes)
      .toEqual([D(6), D(13)]);
  });

  test('rapid taps on a slow network end up on the server exactly as on screen', async ({
    page,
    request,
  }) => {
    const { id } = await createEvent(request);
    await page.goto(`/e/${id}`);
    await joinAs(page, 'Dora');
    await page.route('**/marks', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.continue();
    });
    const grid = myCalendar(page);
    const offsets = [
      3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 3, 5, 7, 9, 11, 13, 14, 15, 16, 4,
    ];
    for (const offset of offsets) await day(grid, D(offset)).click();
    const expected = new Set<string>();
    for (const offset of offsets) {
      const iso = D(offset);
      if (expected.has(iso)) expected.delete(iso);
      else expected.add(iso);
    }
    await saved(page);
    await expect
      .poll(async () => (await myMarks(request, id, 'Dora')).yes, {
        timeout: 15_000,
      })
      .toEqual([...expected].sort());
    await page.reload();
    for (const iso of expected)
      await expect(day(myCalendar(page), iso)).toHaveAttribute(
        'data-state',
        'yes'
      );
  });

  test('"none of these days" counts as an answer', async ({
    page,
    request,
  }) => {
    const { id } = await createEvent(request);
    await page.goto(`/e/${id}`);
    await joinAs(page, 'Emil');
    await page
      .getByRole('button', { name: 'None of these days work for me' })
      .click();
    await expect(
      page.getByText('Saved: none of these days work for you.')
    ).toBeVisible();
    expect((await myMarks(request, id, 'Emil')).answered).toBe(true);
  });

  test('the keyboard can do everything', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(isMobile(testInfo), 'keyboards are a desktop thing');
    const { id } = await createEvent(request);
    await page.goto(`/e/${id}`);
    await joinAs(page, 'Finn');
    const grid = myCalendar(page);
    await day(grid, D(4)).focus();
    await page.keyboard.press('Space');
    await expect(day(grid, D(4))).toHaveAttribute('data-state', 'yes');
    await page.keyboard.press('ArrowRight');
    await expect(day(grid, D(5))).toBeFocused();
    // Shift + arrows span a rectangle, Space applies it.
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Space');
    await expect(day(grid, D(5))).toHaveAttribute('data-state', 'yes');
    await expect(day(grid, D(12))).toHaveAttribute('data-state', 'yes');
    await page.keyboard.press('m');
    await expect(page.getByRole('radio', { name: 'Maybe' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await page.keyboard.press('Control+z');
    await expect(day(grid, D(5))).toHaveAttribute('data-state', 'none');
  });

  test('the whole range is always shown, whatever the height of the screen', async ({
    page,
    request,
  }) => {
    // Mobile browsers change the window height while scrolling, as the
    // address bar slides in and out. The calendar must not follow it.
    const days = daysFromNow(3, 80);
    const { id } = await createEvent(request, { days });
    await page.goto(`/e/${id}`);
    await joinAs(page, 'Gina');
    const grid = myCalendar(page);
    await expect(grid.locator('[data-kind="day"]')).toHaveCount(days.length);
    const size = page.viewportSize()!;
    for (const height of [size.height - 120, 400, size.height]) {
      await page.setViewportSize({ width: size.width, height });
      await expect(grid.locator('[data-kind="day"]')).toHaveCount(days.length);
    }
    await expect(day(grid, D(80))).toHaveAttribute('data-state', 'none');
  });

  test('a long calendar still scrolls under a finger on the week column', async ({
    page,
    request,
    browserName,
  }, testInfo) => {
    test.skip(
      !isMobile(testInfo) || browserName !== 'chromium',
      'real touch input exists in Chromium only'
    );
    const { id } = await createEvent(request, { days: daysFromNow(3, 80) });
    await page.goto(`/e/${id}`);
    await joinAs(page, 'Hugo');
    const grid = myCalendar(page);
    const weekColumn = grid.locator('.cal-body .cal-row > :first-child').nth(1);
    await weekColumn.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    await touchSwipeUp(page, weekColumn, 250);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(before + 100);
    // Nothing was painted on the way.
    await expect(grid.locator('[data-state="yes"]')).toHaveCount(0);
  });

  test('a keyboard selection ends with a click elsewhere, and brush shortcuts ignore modifier keys', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(isMobile(testInfo), 'keyboards are a desktop thing');
    const { id } = await createEvent(request);
    await page.goto(`/e/${id}`);
    await joinAs(page, 'Ida');
    const grid = myCalendar(page);
    await day(grid, D(4)).focus();
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(grid.locator('[data-preview="true"]')).not.toHaveCount(0);
    // A click starts something new: the half-made selection is gone, and a
    // later Space toggles the one day only.
    await day(grid, D(8)).click();
    await expect(day(grid, D(8))).toHaveAttribute('data-state', 'yes');
    await expect(grid.locator('[data-preview="true"]')).toHaveCount(0);
    await page.keyboard.press('Space');
    await expect(day(grid, D(8))).toHaveAttribute('data-state', 'none');
    await expect(day(grid, D(5))).toHaveAttribute('data-state', 'none');
    // Control and Alt belong to the browser and the system, not to the brush.
    await page.keyboard.press('m');
    const maybe = page.getByRole('radio', { name: 'Maybe' });
    await expect(maybe).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Control+y');
    await page.keyboard.press('Alt+y');
    await expect(maybe).toHaveAttribute('aria-checked', 'true');
  });
});
