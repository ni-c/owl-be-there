import type { Locator, Page, TestInfo } from '@playwright/test';
import { isMobile } from './helpers.ts';

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
async function touchDrag(
  page: Page,
  from: Locator,
  to: Locator
): Promise<void> {
  const { start, end } = await centres(page, from, to);
  const steps = 8;
  const points = Array.from({ length: steps + 1 }, (_, i) => ({
    x: start.x + ((end.x - start.x) * i) / steps,
    y: start.y + ((end.y - start.y) * i) / steps,
  }));

  // The engine, not the project name: a renamed project must not silently
  // swap the real touch input for synthetic events.
  if (page.context().browser()?.browserType().name() === 'chromium') {
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
async function mouseDrag(
  page: Page,
  from: Locator,
  to: Locator
): Promise<void> {
  const { start, end } = await centres(page, from, to);
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
  if (isMobile(testInfo)) await touchDrag(page, from, to);
  else await mouseDrag(page, from, to);
}

/**
 * The centres of both ends of a drag. Both elements are scrolled into view
 * before either box is measured, because a scroll caused by the second would
 * invalidate the first measurement; an end that still is not on screen (the
 * two are further apart than one screen) is an error, not a drag at the wrong
 * coordinates.
 */
async function centres(
  page: Page,
  from: Locator,
  to: Locator
): Promise<{ start: Point; end: Point }> {
  await to.scrollIntoViewIfNeeded();
  await from.scrollIntoViewIfNeeded();
  const start = await boxCentre(from);
  const end = await boxCentre(to);
  const viewport = page.viewportSize();
  for (const point of [start, end]) {
    if (
      viewport &&
      (point.x < 0 ||
        point.y < 0 ||
        point.x > viewport.width ||
        point.y > viewport.height)
    )
      throw new Error(
        `drag end at (${point.x}, ${point.y}) is outside the ${viewport.width}x${viewport.height} viewport`
      );
  }
  return { start, end };
}

type Point = { x: number; y: number };

async function boxCentre(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function centre(locator: Locator): Promise<Point> {
  await locator.scrollIntoViewIfNeeded();
  return boxCentre(locator);
}

/**
 * A finger swiping upwards from an element, in Chromium (real touch input):
 * whatever the page does with it — scroll or paint — is the browser's own
 * decision, taken from `touch-action` where the finger went down.
 */
export async function touchSwipeUp(
  page: Page,
  from: Locator,
  distance: number
): Promise<void> {
  const start = await centre(from);
  const cdp = await page.context().newCDPSession(page);
  const point = (y: number) => [
    { x: start.x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 },
  ];
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: point(start.y),
  });
  for (let step = 1; step <= 10; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point(start.y - (distance * step) / 10),
    });
    await page.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await cdp.detach();
}
