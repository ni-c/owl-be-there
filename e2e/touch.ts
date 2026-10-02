import type { Locator, Page, TestInfo } from '@playwright/test';

/**
 * A finger dragged from one element to another, as each browser engine can be
 * made to produce one.
 *
 * **Chromium** gets real touch input through the DevTools protocol: the
 * browser's own gesture handling runs, so if `touch-action: none` were missing
 * from the grid, it would start a scroll and send `pointercancel`, and the
 * drag would fail like it would on a phone.
 *
 * **WebKit** has no such protocol in Playwright, so the pointer events a
 * finger produces are dispatched by hand — all of them on the start element,
 * because that is where implicit pointer capture keeps sending them on iOS.
 * Only the coordinates change. That is precisely the situation the paint
 * engine's geometry-based hit test exists for.
 */
export async function touchDrag(
  page: Page,
  from: Locator,
  to: Locator,
  testInfo: TestInfo
): Promise<void> {
  const start = await centre(from);
  const end = await centre(to);
  const steps = 8;
  const points = Array.from({ length: steps + 1 }, (_, i) => ({
    x: start.x + ((end.x - start.x) * i) / steps,
    y: start.y + ((end.y - start.y) * i) / steps,
  }));

  if (testInfo.project.name.startsWith('chromium')) {
    const cdp = await page.context().newCDPSession(page);
    const send = (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      x: number,
      y: number
    ) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints:
          type === 'touchEnd'
            ? []
            : [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }],
      });
    await send('touchStart', start.x, start.y);
    for (const point of points.slice(1)) {
      await send('touchMove', point.x, point.y);
      // One frame each, like a real finger: the engine samples per frame.
      await page.waitForTimeout(20);
    }
    await send('touchEnd', end.x, end.y);
    await cdp.detach();
    return;
  }

  await from.evaluate(
    (element, path) => {
      const make = (type: string, x: number, y: number) =>
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 7,
          pointerType: 'touch',
          isPrimary: true,
          clientX: x,
          clientY: y,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
        });
      const first = path[0]!;
      element.dispatchEvent(make('pointerdown', first.x, first.y));
      return new Promise<void>((resolve) => {
        let index = 1;
        const step = () => {
          const point = path[index]!;
          element.dispatchEvent(
            make(
              index === path.length - 1 ? 'pointerup' : 'pointermove',
              point.x,
              point.y
            )
          );
          index += 1;
          if (index < path.length) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    },
    [...points, points[points.length - 1]!]
  );
}

/** A mouse drag, for the desktop projects. */
export async function mouseDrag(
  page: Page,
  from: Locator,
  to: Locator
): Promise<void> {
  const start = await centre(from);
  const end = await centre(to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

export async function drag(
  page: Page,
  from: Locator,
  to: Locator,
  testInfo: TestInfo
): Promise<void> {
  if (testInfo.project.name.endsWith('mobile'))
    await touchDrag(page, from, to, testInfo);
  else await mouseDrag(page, from, to);
}

async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
