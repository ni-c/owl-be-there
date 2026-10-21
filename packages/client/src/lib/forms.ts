import {
  candidateBlocks,
  charCount,
  cleanLine,
  cleanText,
  LIMITS,
  mixesScripts,
  nameKey,
  type EmojiKey,
  type EventSnapshotData,
  type ISODate,
} from '@owl/shared';
import type { Problem } from './dayEdit.ts';

/** The organiser's details of an event, as the server stores them. */
export interface DetailsValues {
  title: string;
  description: string | null;
  location: string | null;
  creatorName: string | null;
  emoji: EmojiKey;
  minCount: number | null;
  durationDays: number;
}

/** The details form as typed: every number is still text. */
export interface DetailsInput {
  title: string;
  description: string;
  location: string;
  creatorName: string;
  emoji: EmojiKey;
  minCount: string;
  duration: string;
}

type DetailsErrors = Partial<
  Record<
    'title' | 'location' | 'creatorName' | 'minCount' | 'duration',
    Problem
  >
>;

export type DetailsCheck =
  { ok: true; values: DetailsValues } | { ok: false; errors: DetailsErrors };

export function detailsOf(event: EventSnapshotData['event']): DetailsValues {
  return {
    title: event.title,
    description: event.description,
    location: event.location,
    creatorName: event.creatorName,
    emoji: event.emoji,
    minCount: event.minCount,
    durationDays: event.durationDays,
  };
}

export function inputOf(values: DetailsValues): DetailsInput {
  return {
    title: values.title,
    description: values.description ?? '',
    location: values.location ?? '',
    creatorName: values.creatorName ?? '',
    emoji: values.emoji,
    minCount: values.minCount?.toString() ?? '',
    duration: values.durationDays.toString(),
  };
}

/**
 * Digits of a number field in ASCII: Persian (۰-۹) and Arabic-Indic (٠-٩)
 * ones are turned into 0-9, anything else that is no digit is dropped.
 */
export function asciiDigits(text: string): string {
  return text
    .replace(/[\u06f0-\u06f9\u0660-\u0669]/g, (digit) =>
      String(digit.charCodeAt(0) & 0xf)
    )
    .replace(/\D/g, '');
}

const numberProblem = (min: number, max: number): Problem => ({
  key: 'error.numberRange',
  params: { min, max },
});

/**
 * What the server's text schema would refuse in a one-line field that is not
 * empty: text with nothing visible in it (a blank Hangul filler, say).
 */
export function invisibleProblem(text: string): Problem | null {
  return cleanLine(text) !== '' && nameKey(text) === ''
    ? { key: 'error.textInvisible', params: {} }
    : null;
}

/** The title: required, and not only invisible characters. */
export function checkTitle(text: string): Problem | null {
  if (cleanLine(text) === '') return { key: 'error.titleRequired', params: {} };
  return invisibleProblem(text);
}

/** A whole number from `min` to `max` in the text, or null. */
function wholeNumber(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value >= min && value <= max ? value : null;
}

/** The number of people needed: empty means none, else 1 up to the limit. */
export function checkMinCount(text: string): {
  value: number | null;
  problem: Problem | null;
} {
  const trimmed = text.trim();
  if (trimmed === '') return { value: null, problem: null };
  const value = wholeNumber(trimmed, 1, LIMITS.participants);
  return {
    value,
    problem: value === null ? numberProblem(1, LIMITS.participants) : null,
  };
}

/**
 * Check what the organiser typed the way the wizard does, instead of nudging
 * it into range: an empty or out-of-range duration is an error, not a quiet
 * one day. `days` are the event's current days; the duration must still have
 * a run of that many in a row.
 */
export function checkDetails(
  input: DetailsInput,
  days: readonly ISODate[]
): DetailsCheck {
  const errors: DetailsErrors = {};
  const title = cleanLine(input.title);
  const titleProblem = checkTitle(input.title);
  if (titleProblem) errors.title = titleProblem;
  const location = cleanLine(input.location);
  const locationProblem = invisibleProblem(input.location);
  if (locationProblem) errors.location = locationProblem;
  const creatorName = cleanLine(input.creatorName);
  const creatorProblem = invisibleProblem(input.creatorName);
  if (creatorProblem) errors.creatorName = creatorProblem;

  const minCount = checkMinCount(input.minCount);
  if (minCount.problem) errors.minCount = minCount.problem;

  const durationDays = wholeNumber(
    input.duration.trim(),
    1,
    LIMITS.durationDays
  );
  if (durationDays === null)
    errors.duration = numberProblem(1, LIMITS.durationDays);
  else if (candidateBlocks(days, durationDays).length === 0)
    errors.duration = { key: 'error.noBlock', params: { count: durationDays } };

  if (Object.keys(errors).length > 0 || durationDays === null)
    return { ok: false, errors };
  return {
    ok: true,
    values: {
      title,
      description: cleanText(input.description) || null,
      location: location || null,
      creatorName: creatorName || null,
      emoji: input.emoji,
      minCount: minCount.value,
      durationDays,
    },
  };
}

/**
 * The fields that differ from the values the form started from. Sending only
 * those keeps a save from putting back what someone changed elsewhere in the
 * meantime — the duration set on the phone, say, while the title was fixed on
 * the laptop.
 */
export function changedFields(
  seed: DetailsValues,
  next: DetailsValues
): Partial<DetailsValues> {
  const patch: Partial<DetailsValues> = {};
  for (const key of Object.keys(seed) as (keyof DetailsValues)[])
    if (seed[key] !== next[key]) Object.assign(patch, { [key]: next[key] });
  return patch;
}

/**
 * Whether the details form holds something not saved yet: a valid input that
 * changes a field, or an invalid one that is not just what was loaded.
 */
export function hasUnsavedDetails(
  seed: DetailsValues,
  input: DetailsInput,
  days: readonly ISODate[]
): boolean {
  const check = checkDetails(input, days);
  if (check.ok)
    return Object.keys(changedFields(seed, check.values)).length > 0;
  const loaded = inputOf(seed);
  return (Object.keys(loaded) as (keyof DetailsInput)[]).some(
    (key) => loaded[key] !== input[key]
  );
}

export interface Roster {
  names: string[];
  problem: Problem | null;
}

/**
 * The names typed one per line, checked the way the server checks each one.
 * Nothing is cut off silently: a list longer than one go may hold, a name
 * longer than a name may be, a line with nothing visible in it or a word that
 * mixes Latin letters with Cyrillic or Greek ones is a problem — the last two
 * name the line, counted as typed, empty lines included.
 */
export function parseRoster(text: string): Roster {
  const names: string[] = [];
  let problem: Problem | null = null;
  const refuse = (found: Problem) => {
    problem ??= found;
  };
  text.split('\n').forEach((raw, index) => {
    if (raw.trim() === '') return;
    const name = cleanLine(raw);
    names.push(name);
    const line = index + 1;
    if (charCount(name) > LIMITS.name)
      refuse({ key: 'error.rosterLine', params: { max: LIMITS.name } });
    else if (nameKey(raw) === '')
      refuse({ key: 'error.rosterInvisible', params: { line } });
    else if (mixesScripts(raw))
      refuse({ key: 'error.rosterMixed', params: { line } });
  });
  if (names.length > LIMITS.roster)
    problem = { key: 'error.rosterTooMany', params: { max: LIMITS.roster } };
  return { names, problem };
}
