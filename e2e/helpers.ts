import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';

// Read once per worker, so D(n) is the same day for the whole run even when it
// crosses midnight UTC between creating an event and clicking its days.
const BASE = Date.now();

/** A day `offset` days from today, in UTC — far enough ahead to be valid in every zone. */
export function dayFromNow(offset: number): string {
  const date = new Date(BASE);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** A day string as a `Date` at midnight UTC, for `Intl` formatting in UTC. */
export function utcDateOf(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

export function daysFromNow(from: number, to: number): string[] {
  const days: string[] = [];
  for (let offset = from; offset <= to; offset += 1)
    days.push(dayFromNow(offset));
  return days;
}

interface CreatedEvent {
  id: string;
  adminToken: string;
}

export async function createEvent(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
): Promise<CreatedEvent> {
  const response = await request.post('/api/events', {
    data: {
      title: 'Summer tournament',
      emoji: 'soccer',
      language: 'en',
      durationDays: 1,
      days: daysFromNow(3, 16),
      ...overrides,
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

/**
 * Answer as someone through the API. `baseRev` is the revision the answer is
 * based on: 0 creates it, a later one must be the current revision.
 */
export async function answer(
  request: APIRequestContext,
  id: string,
  name: string,
  yes: string[],
  maybe: string[] = [],
  baseRev = 0
): Promise<void> {
  const session = await (
    await request.post(`/api/events/${id}/session`, { data: { name } })
  ).json();
  const response = await request.put(
    `/api/events/${id}/participants/${session.participantId}/marks`,
    {
      headers: { 'x-participant-token': session.token },
      data: { baseRev, yes, maybe },
    }
  );
  expect(response.status()).toBe(200);
}

export async function snapshot(request: APIRequestContext, id: string) {
  return (await request.get(`/api/events/${id}`)).json();
}

/** Phones show the two views as tabs; wide screens show both at once. */
export async function showView(
  page: Page,
  view: 'mine' | 'group'
): Promise<void> {
  // The page shows a loading state first; the tabs (or, on wide screens, the
  // calendars) exist only once the event is in, and `isVisible` does not wait.
  await page.getByRole('tablist').or(page.getByRole('grid')).first().waitFor();
  const tab = page.getByRole('tab', {
    name: view === 'mine' ? 'My days' : /^Group/,
  });
  if (await tab.isVisible()) await tab.click();
}

/** The calendar of the "My days" view. */
export function myCalendar(page: Page): Locator {
  return page.getByRole('grid', { name: 'My days' });
}

export function groupCalendar(page: Page): Locator {
  return page.getByRole('grid', { name: 'Group' });
}

export function day(grid: Locator, iso: string): Locator {
  return grid.locator(`[data-day="${iso}"]`);
}

/** Say who you are with a name typed in. */
export async function joinAs(page: Page, name: string): Promise<void> {
  await showView(page, 'mine');
  await page.getByLabel('Your name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(`Hi ${name}!`)).toBeVisible();
}

export function isMobile(testInfo: TestInfo): boolean {
  // Touch devices are the phone projects; the name of the project is free text.
  return Boolean(testInfo.project.use.hasTouch);
}

/** Wait until the last change is on the server. */
export async function saved(page: Page): Promise<void> {
  await expect(
    page.getByRole('status').filter({ hasText: 'Saved' })
  ).toBeVisible();
}
