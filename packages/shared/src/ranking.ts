import { compareISODate, diffDays, type ISODate } from './dates.js';

/** One person's answer for one day or block. */
export type Answer = 'yes' | 'maybe' | 'no' | 'open';

/** What the ranking needs to know about a participant. */
export interface Respondent {
  id: string;
  /** False until they have saved at least once — never answered is not "no". */
  answered: boolean;
  yes: ReadonlySet<ISODate>;
  maybe: ReadonlySet<ISODate>;
  /** Days added after their last save: they have not seen them yet. */
  unseen: ReadonlySet<ISODate>;
}

/** The ranking's view of a participant of an event snapshot. */
export function respondentOf(p: {
  id: string;
  answered: boolean;
  yes: readonly ISODate[];
  maybe: readonly ISODate[];
  unseen: readonly ISODate[];
}): Respondent {
  return {
    id: p.id,
    answered: p.answered,
    yes: new Set(p.yes),
    maybe: new Set(p.maybe),
    unseen: new Set(p.unseen),
  };
}

/** A person's answer for one day. */
export function answerFor(person: Respondent, day: ISODate): Answer {
  if (!person.answered || person.unseen.has(day)) return 'open';
  if (person.yes.has(day)) return 'yes';
  if (person.maybe.has(day)) return 'maybe';
  return 'no';
}

/**
 * A person's answer for a block of consecutive days.
 *
 * A block needs them on every day, so one "no" decides it. Short of a no, a day
 * they have not answered leaves the block open; short of that, one "maybe"
 * makes the whole block a maybe.
 */
export function blockAnswer(
  person: Respondent,
  days: readonly ISODate[]
): Answer {
  let open = false;
  let maybe = false;
  for (const day of days) {
    const answer = answerFor(person, day);
    if (answer === 'no') return 'no';
    if (answer === 'open') open = true;
    else if (answer === 'maybe') maybe = true;
  }
  if (open) return 'open';
  return maybe ? 'maybe' : 'yes';
}

/** Participant ids by answer. */
export interface Tally {
  yes: string[];
  maybe: string[];
  no: string[];
  open: string[];
}

export function tally(
  people: readonly Respondent[],
  days: readonly ISODate[]
): Tally {
  const result: Tally = { yes: [], maybe: [], no: [], open: [] };
  for (const person of people)
    result[blockAnswer(person, days)].push(person.id);
  return result;
}

/**
 * Every run of `duration` consecutive calendar days that are all candidates.
 *
 * Candidate days must be sorted and unique. With a duration of one, every
 * candidate day is its own block.
 */
export function candidateBlocks(
  candidates: readonly ISODate[],
  duration: number
): ISODate[][] {
  const blocks: ISODate[][] = [];
  if (duration < 1) return blocks;
  for (let start = 0; start + duration <= candidates.length; start += 1) {
    const slice = candidates.slice(start, start + duration);
    // Sorted and unique, so `duration` days spanning `duration - 1` days of
    // calendar are consecutive — no gap can hide in between.
    if (diffDays(slice[0]!, slice[slice.length - 1]!) === duration - 1) {
      blocks.push(slice);
    }
  }
  return blocks;
}

export interface RankedBlock {
  start: ISODate;
  end: ISODate;
  days: ISODate[];
  tally: Tally;
  /** At least `minCount` people can come for sure. */
  meetsMin: boolean;
  /** At least `minCount` can come if the maybes do. */
  mayMeetMin: boolean;
}

export interface RankingInput {
  candidates: readonly ISODate[];
  people: readonly Respondent[];
  /** Ids left out of the count — "what if we go without Max?". */
  hidden?: ReadonlySet<string>;
  duration: number;
  minCount: number | null;
  /** Blocks starting before this day are over and are left out. */
  today: ISODate;
}

/**
 * The blocks ranked best first: most certain yeses, then most maybes, then the
 * earliest. Blocks that have begun are left out; there is no point in
 * suggesting a weekend that is already half over.
 *
 * Without a minimum count both flags are true — nothing to fall short of.
 */
export function rankBlocks(input: RankingInput): RankedBlock[] {
  const hidden = input.hidden ?? new Set<string>();
  const people = input.people.filter((person) => !hidden.has(person.id));
  const min = input.minCount;
  return candidateBlocks(input.candidates, input.duration)
    .filter((days) => compareISODate(days[0]!, input.today) >= 0)
    .map((days) => {
      const result = tally(people, days);
      return {
        start: days[0]!,
        end: days[days.length - 1]!,
        days,
        tally: result,
        meetsMin: min === null || result.yes.length >= min,
        mayMeetMin:
          min === null || result.yes.length + result.maybe.length >= min,
      };
    })
    .sort(
      (a, b) =>
        b.tally.yes.length - a.tally.yes.length ||
        b.tally.maybe.length - a.tally.maybe.length ||
        compareISODate(a.start, b.start)
    );
}

/**
 * How warm a day is on the heatmap, from 0 to 1: the share of people who
 * answered for that day and can come, a maybe counting half. People who have
 * not answered are left out of the share rather than counted as a no, so the
 * first three answers already paint a meaningful picture.
 */
export function heatOf(dayTally: Tally): number {
  const answered =
    dayTally.yes.length + dayTally.maybe.length + dayTally.no.length;
  if (answered === 0) return 0;
  return (dayTally.yes.length + dayTally.maybe.length / 2) / answered;
}

/** The heat in six steps for the colour scale: 0 is no one, 5 is everyone. */
export function heatLevel(heat: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (!(heat > 0)) return 0;
  return Math.min(5, Math.max(1, Math.ceil(heat * 5))) as 1 | 2 | 3 | 4 | 5;
}
