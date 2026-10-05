import {
  addDays,
  monthKeyOf,
  weekdayOf,
  type ISODate,
  type Weekday,
} from './dates.js';
import { expiresOn } from './retention.js';
import type { EventSnapshotData } from './schemas.js';
import { splitMarks, type Mark, type Marks } from './selection.js';

/**
 * The example on the start page and in the README: ten people planning a team
 * dinner over the month after the current one.
 *
 * The answers are rules over weekdays and parts of the month, not dates, so the
 * example looks alike whichever month it shows: one evening in the third week
 * that nearly everyone can make, and a few more that reach the minimum of six.
 */

/** Every day of the month after the one `today` falls in. */
export function monthAfter(today: ISODate): ISODate[] {
  // The 28th plus four days is always in the next month, whatever this one's
  // length; from there, back to its first day.
  const later = addDays(`${monthKeyOf(today)}-28`, 4);
  const month = monthKeyOf(later);
  const days: ISODate[] = [];
  for (
    let day = `${month}-01`;
    monthKeyOf(day) === month;
    day = addDays(day, 1)
  ) {
    days.push(day);
  }
  return days;
}

type Rule = (weekday: Weekday, date: number) => Mark | null;

const MON = 0;
const TUE = 1;
const WED = 2;
const THU = 3;
const FRI = 4;
const SAT = 5;
const SUN = 6;

/** Who comes when. Anna is first: the example is seen through her eyes. */
export const PEOPLE: readonly { name: string; rule: Rule }[] = [
  {
    name: 'Anna',
    rule: (w) =>
      w === TUE || w === WED || w === THU ? 'yes' : w === FRI ? 'maybe' : null,
  },
  {
    name: 'Ben',
    rule: (w, d) =>
      w === SAT || w === SUN ? 'yes' : w === THU && d >= 15 ? 'maybe' : null,
  },
  {
    name: 'Chloé',
    rule: (w, d) =>
      (d <= 14 && w <= FRI) || (w === THU && d <= 21) ? 'yes' : null,
  },
  {
    name: 'David',
    rule: (w, d) => (d >= 8 && d <= 14 ? null : w === MON ? 'maybe' : 'yes'),
  },
  {
    name: 'Emma',
    rule: (w) => (w === MON || w === WED || w === THU ? 'yes' : null),
  },
  {
    name: 'Felix',
    rule: (w, d) => (d >= 14 && d <= 24 && w <= FRI ? 'yes' : null),
  },
  {
    name: 'Hana',
    rule: (w) => (w === THU || w === FRI || w === SAT ? 'yes' : null),
  },
  {
    name: 'Jonas',
    rule: (w, d) =>
      d >= 10 && d <= 21 && w !== TUE
        ? 'yes'
        : w === SAT || w === SUN
          ? 'maybe'
          : null,
  },
  {
    name: 'Lena',
    rule: (w) => (w === WED || w === THU ? 'yes' : w === TUE ? 'maybe' : null),
  },
  {
    name: 'Max',
    rule: (w, d) => (w === THU && d <= 14 ? null : w === SUN ? 'maybe' : 'yes'),
  },
];

/** One person's marks over the given days. */
export function marksOf(rule: Rule, days: readonly ISODate[]): Marks {
  const marks = new Map<ISODate, Mark>();
  for (const day of days) {
    const mark = rule(weekdayOf(day), Number(day.slice(8, 10)));
    if (mark) marks.set(day, mark);
  }
  return marks;
}

/** Ids that pass the id check: twelve base58 characters. */
const EVENT_ID = 'Examp1eEvent';
const personId = (index: number): string =>
  `Examp1ePers${'ABCDEFGHJK'[index]!}`;

/**
 * The example event as the server would send it. Anna's marks come from the
 * caller — the start page lets visitors paint them — and everyone else's from
 * their rules.
 */
export function exampleSnapshot(options: {
  today: ISODate;
  title: string;
  anna: Marks;
}): EventSnapshotData {
  const days = monthAfter(options.today);
  const last = days[days.length - 1]!;
  return {
    event: {
      id: EVENT_ID,
      title: options.title,
      description: null,
      location: null,
      emoji: 'drinks',
      creatorName: 'Anna',
      language: 'en',
      durationDays: 1,
      minCount: 6,
      status: 'open',
      finalStart: null,
      finalEnd: null,
      createdAt: 0,
      expiresOn: expiresOn({
        lastWriteDay: options.today,
        lastCandidateDay: last,
        finalEnd: null,
        // The sample people have answered.
        answered: true,
      }),
      version: 1,
      days,
    },
    participants: PEOPLE.map((person, index) => {
      const marks = index === 0 ? options.anna : marksOf(person.rule, days);
      const { yes, maybe } = splitMarks(marks);
      return {
        id: personId(index),
        name: person.name,
        note: null,
        source: 'roster' as const,
        answered: marks.size > 0,
        hasPassword: false,
        rev: 1,
        yes,
        maybe,
        unseen: [],
      };
    }),
  };
}
