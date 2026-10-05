import {
  candidateBlocks,
  charCount,
  LIMITS,
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

export type DetailsErrors = Partial<
  Record<'title' | 'minCount' | 'duration', Problem>
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

const numberProblem = (min: number, max: number): Problem => ({
  key: 'error.numberRange',
  params: { min, max },
});

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
  const title = input.title.trim();
  if (title === '') errors.title = { key: 'error.titleRequired', params: {} };

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
      description: input.description.trim() || null,
      location: input.location.trim() || null,
      creatorName: input.creatorName.trim() || null,
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

export interface Roster {
  names: string[];
  problem: Problem | null;
}

/**
 * The names typed one per line. Nothing is cut off silently: a list longer
 * than one go may hold, or a name longer than a name may be, is a problem.
 */
export function parseRoster(text: string): Roster {
  const names = text
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);
  let problem: Problem | null = null;
  if (names.length > LIMITS.roster)
    problem = { key: 'error.rosterTooMany', params: { max: LIMITS.roster } };
  else if (names.some((name) => charCount(name) > LIMITS.name))
    problem = { key: 'error.rosterLine', params: { max: LIMITS.name } };
  return { names, problem };
}
