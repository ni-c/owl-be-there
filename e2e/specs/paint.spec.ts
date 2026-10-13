import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  createEvent,
  day,
  dayFromNow,
  daysFromNow,
  groupCalendar,
  isMobile,
  joinAs,
  myCalendar,
  saved,
  showView,
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

/** A key with the modifiers held down. */
interface Chord {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

/**
 * Sends a keydown to a day cell and says whether the page left it to the
 * browser. Dispatched in the page, so a shortcut like Alt+ArrowLeft cannot
 * navigate away, and the same on every browser and screen.
 */
function leftToBrowser(cell: Locator, chord: Chord): Promise<boolean> {
  return cell.evaluate((element, init) => {
    const event = new KeyboardEvent('keydown', {
      ...init,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return !event.defaultPrevented;
  }, chord);
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

  test('Alt, Cmd and Ctrl with the arrow keys, Home and End are left to the browser', async ({
    page,
    request,
  }) => {
    const { id } = await createEvent(request);
    await page.goto(`/e/${id}`);
    await joinAs(page, 'Jonas');
    const grid = myCalendar(page);
    // Back and Forward (Alt on Windows and Linux, Cmd on macOS), and the top
    // and bottom of the page.
    const chords: Chord[] = [
      { key: 'ArrowLeft', altKey: true },
      { key: 'ArrowRight', altKey: true },
      { key: 'ArrowLeft', metaKey: true },
      { key: 'ArrowRight', metaKey: true },
      { key: 'ArrowUp', ctrlKey: true },
      { key: 'ArrowDown', metaKey: true },
      { key: 'Home', ctrlKey: true },
      { key: 'End', ctrlKey: true },
      { key: 'Home', metaKey: true },
      { key: 'End', altKey: true },
      // Shift does not give the keys back to the page.
      { key: 'ArrowRight', altKey: true, shiftKey: true },
      { key: 'ArrowDown', ctrlKey: true, shiftKey: true },
    ];
    // The first day, one in the middle and the last: Home and End have
    // nowhere to go at the ends, and still must not be taken.
    for (const offset of [3, 9, 16]) {
      const cell = day(grid, D(offset));
      await cell.focus();
      for (const chord of chords) {
        expect(await leftToBrowser(cell, chord), JSON.stringify(chord)).toBe(
          true
        );
        await expect(cell).toBeFocused();
      }
    }
    // Nothing was selected or painted on the way.
    await expect(grid.locator('[data-preview="true"]')).toHaveCount(0);
    await expect(grid.locator('[data-state="yes"]')).toHaveCount(0);
    // The same keys without a modifier are the calendar's, so the check above
    // is not passing for want of a handler.
    const cell = day(grid, D(9));
    await cell.focus();
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      expect(await leftToBrowser(cell, { key }), key).toBe(false);
      expect(await leftToBrowser(cell, { key, shiftKey: true }), key).toBe(
        false
      );
    }
    for (const key of ['Home', 'End']) {
      expect(await leftToBrowser(cell, { key }), key).toBe(false);
      expect(await leftToBrowser(cell, { key, shiftKey: true }), key).toBe(
        false
      );
    }
  });

  test('the arrow keys, Home and End still move the focus, and Shift extends a selection', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(isMobile(testInfo), 'keyboards are a desktop thing');
    const { id } = await createEvent(request);
    await page.goto(`/e/${id}`);
    await joinAs(page, 'Karla');
    const grid = myCalendar(page);
    await day(grid, D(9)).focus();
    await page.keyboard.press('ArrowRight');
    await expect(day(grid, D(10))).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(day(grid, D(9))).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(day(grid, D(16))).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(day(grid, D(9))).toBeFocused();
    // Home and End go to the ends of the week, as far as it has days.
    const ends = await day(grid, D(9)).evaluate((element) => {
      const row = element.closest('[role="row"]')!;
      const cells = [...row.querySelectorAll<HTMLElement>('[data-day]')];
      return {
        first: cells[0]!.dataset.day!,
        last: cells.at(-1)!.dataset.day!,
      };
    });
    await page.keyboard.press('End');
    await expect(day(grid, ends.last)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(day(grid, ends.first)).toBeFocused();
    // The first and the last day of the range: nowhere further to go.
    await day(grid, D(3)).focus();
    await page.keyboard.press('Home');
    await expect(day(grid, D(3))).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(day(grid, D(3))).toBeFocused();
    await day(grid, D(16)).focus();
    await page.keyboard.press('End');
    await expect(day(grid, D(16))).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(day(grid, D(16))).toBeFocused();
    // Shift + arrow spans a rectangle from where it started.
    await day(grid, D(4)).focus();
    await page.keyboard.press('Shift+ArrowDown');
    await expect(day(grid, D(11))).toBeFocused();
    await expect(day(grid, D(4))).toHaveAttribute('data-preview', 'true');
    await expect(day(grid, D(11))).toHaveAttribute('data-preview', 'true');
    await page.keyboard.press('Space');
    await expect(day(grid, D(4))).toHaveAttribute('data-state', 'yes');
    await expect(day(grid, D(11))).toHaveAttribute('data-state', 'yes');
    // Shift + Home selects along the week.
    await day(grid, D(16)).focus();
    await page.keyboard.press('Shift+Home');
    await expect(grid.locator('[data-preview="true"]')).not.toHaveCount(0);
  });

  test('undo with Control or Cmd and Z still works on a focused day', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(isMobile(testInfo), 'keyboards are a desktop thing');
    const { id } = await createEvent(request);
    await page.goto(`/e/${id}`);
    await joinAs(page, 'Lena');
    const grid = myCalendar(page);
    const cell = day(grid, D(6));
    await cell.focus();
    await page.keyboard.press('Space');
    await expect(cell).toHaveAttribute('data-state', 'yes');
    await page.keyboard.press('Control+z');
    await expect(cell).toHaveAttribute('data-state', 'none');
    await page.keyboard.press('Space');
    await expect(cell).toHaveAttribute('data-state', 'yes');
    await page.keyboard.press('Meta+z');
    await expect(cell).toHaveAttribute('data-state', 'none');
    // With nothing left to undo, the keys change nothing.
    await page.keyboard.press('Control+z');
    await expect(grid.locator('[data-state="yes"]')).toHaveCount(0);
  });
});

/** The layout with two tabs instead of two columns starts below 56rem. */
async function narrow(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 0) >= 896)
    await page.setViewportSize({ width: 390, height: 844 });
}

test.describe('the tabs of a narrow screen', () => {
  test('marks that could not be saved yet survive a visit to the Group tab', async ({
    page,
    context,
    request,
  }) => {
    await narrow(page);
    const { id } = await createEvent(request);
    await page.goto(`/e/${id}`);
    await joinAs(page, 'Jonas');
    const cell = day(myCalendar(page), D(4));
    await context.setOffline(true);
    await cell.click();
    await expect(cell).toHaveAttribute('data-state', 'yes');
    await expect(
      page.getByRole('status').filter({ hasText: 'Offline' })
    ).toBeVisible();
    // Leaving "My days" must not end the retries; the stroke is not on the
    // server, and nothing but this page knows about it.
    await showView(page, 'group');
    await expect(page.getByRole('tabpanel')).toHaveAccessibleName(/^Group/);
    expect((await myMarks(request, id, 'Jonas')).yes).toEqual([]);
    await context.setOffline(false);
    await showView(page, 'mine');
    await expect(cell).toHaveAttribute('data-state', 'yes');
    // The next retry comes within ten seconds at the longest.
    await expect
      .poll(async () => (await myMarks(request, id, 'Jonas')).yes, {
        timeout: 20_000,
      })
      .toEqual([D(4)]);
    await saved(page);
  });

  test('switching tabs with nothing unsaved loses nothing and sends nothing', async ({
    page,
    request,
  }) => {
    await narrow(page);
    const { id } = await createEvent(request);
    await page.goto(`/e/${id}`);
    await joinAs(page, 'Kai');
    const cell = day(myCalendar(page), D(4));
    await cell.click();
    await saved(page);
    const writes: string[] = [];
    page.on('request', (r) => {
      if (r.method() !== 'GET') writes.push(`${r.method()} ${r.url()}`);
    });
    for (let round = 0; round < 2; round += 1) {
      await showView(page, 'group');
      await expect(groupCalendar(page)).toBeVisible();
      await showView(page, 'mine');
      await expect(cell).toHaveAttribute('data-state', 'yes');
    }
    expect(writes).toEqual([]);
    expect((await myMarks(request, id, 'Kai')).yes).toEqual([D(4)]);
  });

  test('each tab controls a panel of its own, and only the selected one is shown', async ({
    page,
    request,
  }) => {
    await narrow(page);
    const { id } = await createEvent(request);
    await page.goto(`/e/${id}`);
    await showView(page, 'mine');
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(2);
    await expect(page.locator('[role="tabpanel"]')).toHaveCount(2);
    await expect(page.locator('[role="tabpanel"]:not([hidden])')).toHaveCount(
      1
    );
    await expect(page.getByRole('tabpanel')).toHaveAccessibleName(/^My days/);
    const controlled: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const tab = tabs.nth(index);
      const panelId = (await tab.getAttribute('aria-controls'))!;
      const panel = page.locator(`[id="${panelId}"]`);
      await expect(panel).toHaveAttribute('role', 'tabpanel');
      await expect(panel).toHaveAttribute(
        'aria-labelledby',
        (await tab.getAttribute('id'))!
      );
      controlled.push(panelId);
    }
    expect(new Set(controlled).size).toBe(2);
    await tabs.nth(1).click();
    await expect(page.locator('[role="tabpanel"]:not([hidden])')).toHaveCount(
      1
    );
    await expect(page.getByRole('tabpanel')).toHaveAccessibleName(/^Group/);
  });

  test('the arrow keys switch between the tabs, wrapping at both ends', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(isMobile(testInfo), 'keyboards are a desktop thing');
    await narrow(page);
    const { id } = await createEvent(request);
    await page.goto(`/e/${id}`);
    await showView(page, 'mine');
    const tabs = page.getByRole('tab');
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toHaveAccessibleName(/^Group/);
    // Past the last tab, back to the first; and before the first, the last.
    await page.keyboard.press('ArrowRight');
    await expect(tabs.first()).toBeFocused();
    await expect(page.getByRole('tabpanel')).toHaveAccessibleName(/^My days/);
    await page.keyboard.press('ArrowLeft');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(page.getByRole('tabpanel')).toHaveAccessibleName(/^Group/);
  });
});

/**
 * Hold a mouse button down on a day cell and check its press feedback: it
 * shrinks (polled, since a busy browser applies the 120 ms scale late), or it
 * still has its full size well after the scale would have run. The button is
 * released on the cell, which is a tap.
 */
async function expectPress(
  page: Page,
  cell: Locator,
  shrinks: boolean
): Promise<void> {
  const scale = () =>
    cell.evaluate(
      (element) => new DOMMatrix(getComputedStyle(element).transform).a
    );
  await cell.hover();
  await page.mouse.down();
  if (shrinks) {
    await expect.poll(scale).toBeLessThan(1);
  } else {
    await page.waitForTimeout(300);
    expect(await scale()).toBe(1);
  }
  await page.mouse.up();
}

test.describe('press feedback', () => {
  test('a day that does something shrinks under the mouse, one that does nothing stays put', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(isMobile(testInfo), 'the press is checked with a mouse');
    const { id, adminToken } = await createEvent(request);
    await page.goto(`/e/${id}`);
    await joinAs(page, 'Mara');

    // A day to paint, and a day of the group view, which opens a sheet.
    await expectPress(page, day(myCalendar(page), D(4)), true);
    await saved(page);
    await showView(page, 'group');
    await expectPress(page, day(groupCalendar(page), D(4)), true);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Close' })
      .click();

    // Once the poll is closed no day can be painted: aria-disabled, not the
    // disabled attribute, says so, and the press must not suggest otherwise.
    const closed = await request.put(`/api/events/${id}/status`, {
      headers: { 'x-admin-token': adminToken },
      data: { status: 'closed' },
    });
    expect(closed.status()).toBe(200);
    await page.reload();
    await showView(page, 'mine');
    await expect(myCalendar(page)).toHaveAttribute('aria-readonly', 'true');
    const inert = day(myCalendar(page), D(5));
    await expect(inert).toHaveAttribute('aria-disabled', 'true');
    await expectPress(page, inert, false);

    // The group view stays clickable and keeps its feedback.
    await showView(page, 'group');
    await expectPress(page, day(groupCalendar(page), D(5)), true);
  });
});
