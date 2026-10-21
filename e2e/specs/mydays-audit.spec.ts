import { expect, test } from '@playwright/test';
import { LIMITS } from '@owl/shared';
import { en } from '../../packages/client/src/i18n/en.ts';
import {
  createEvent,
  greeting,
  joinAs,
  saved,
  showView,
  snapshot,
} from '../helpers.ts';

const noteOf = async (
  request: Parameters<typeof snapshot>[0],
  id: string,
  name: string
) => {
  const data = await snapshot(request, id);
  return data.participants.find((p: { name: string }) => p.name === name)?.note;
};

test('Enter while an input method composes neither saves nor leaves the note', async ({
  page,
  request,
}) => {
  const { id } = await createEvent(request);
  await page.goto(`/e/${id}`);
  await joinAs(page, 'Mia');
  const note = page.getByLabel('Note', { exact: false }).first();
  await note.fill('half typed');
  await note.dispatchEvent('keydown', {
    key: 'Enter',
    keyCode: 229,
    isComposing: true,
  });
  await expect(note).toBeFocused();
  expect(await noteOf(request, id, 'Mia')).toBeFalsy();
  await note.press('Enter');
  await saved(page);
  expect(await noteOf(request, id, 'Mia')).toBe('half typed');
});

test('a blur without typing leaves a note changed elsewhere alone', async ({
  page,
  request,
}) => {
  const { id } = await createEvent(request);
  await page.goto(`/e/${id}`);
  await joinAs(page, 'Noor');
  const note = page.getByLabel('Note', { exact: false }).first();
  await note.fill('first');
  await note.blur();
  await saved(page);
  await note.focus();
  await note.blur();
  expect(await noteOf(request, id, 'Noor')).toBe('first');
});

test('an Arabic name keeps its direction in the greeting', async ({
  page,
  request,
}) => {
  const { id } = await createEvent(request);
  await page.goto(`/e/${id}`);
  await joinAs(page, 'مريم');
  await expect(greeting(page, 'مريم')).toBeVisible();
  await expect(
    page.getByLabel('Note', { exact: false }).first()
  ).toHaveAttribute('dir', 'auto');
});

test('focus lands on the greeting after joining and on the form after "Not you?"', async ({
  page,
  request,
}) => {
  const { id } = await createEvent(request);
  await page.goto(`/e/${id}`);
  await joinAs(page, 'Lena');
  await expect(greeting(page, 'Lena')).toBeFocused();
  await page.getByRole('button', { name: 'Not you?' }).click();
  await expect(
    page.getByRole('heading', { name: 'What’s your name?' })
  ).toBeFocused();
});

test('a too-short password shows the app message, not the native bubble', async ({
  page,
  request,
}) => {
  const { id } = await createEvent(request);
  await page.goto(`/e/${id}`);
  await showView(page, 'mine');
  await page.getByLabel('Your name', { exact: true }).fill('Omar');
  await page.getByLabel('Protect my entry with a password').check();
  await page.getByLabel('Password', { exact: true }).fill('abc');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByText(
      en['who.passwordTooShort'].replace('{min}', String(LIMITS.passwordMin))
    )
  ).toBeVisible();
  const native = await page
    .getByLabel('Password', { exact: true })
    .evaluate((el) => (el as HTMLInputElement).validity.tooShort);
  expect(native).toBe(false);
});
