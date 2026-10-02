import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';

/** A day `offset` days from today, in UTC — far enough ahead to be valid in every zone. */
export function dayFromNow(offset: number): string {
  const date = new Date();
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

export interface CreatedEvent {
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

/** Answer as someone through the API. */
export async function answer(
  request: APIRequestContext,
  id: string,
  name: string,
  yes: string[],
  maybe: string[] = []
): Promise<void> {
  const session = await (
    await request.post(`/api/events/${id}/session`, { data: { name } })
  ).json();
  const response = await request.put(
    `/api/events/${id}/participants/${session.participantId}/marks`,
    {
      headers: { 'x-participant-token': session.token },
      data: { baseRev: 0, yes, maybe },
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
  const someoneElse = page.getByRole('button', { name: 'Someone else' });
  if (await someoneElse.isVisible()) await someoneElse.click();
  await page.getByLabel('Your name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(`Hi ${name}!`)).toBeVisible();
}

export function isMobile(testInfo: TestInfo): boolean {
  return testInfo.project.name.endsWith('mobile');
}

/** Wait until the last change is on the server. */
export async function saved(page: Page): Promise<void> {
  await expect(
    page.getByRole('status').filter({ hasText: 'Saved' })
  ).toBeVisible();
}
