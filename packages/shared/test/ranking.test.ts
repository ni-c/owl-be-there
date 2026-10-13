import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  answerFor,
  blockAnswer,
  blockFits,
  candidateBlocks,
  dayNumber,
  expandRange,
  heatLevel,
  heatOf,
  LAST_DAY,
  rankBlocks,
  respondentOf,
  tally,
  type Respondent,
} from '../src/index.js';

const person = (
  id: string,
  yes: string[],
  maybe: string[] = [],
  options: { answered?: boolean; unseen?: string[] } = {}
): Respondent => ({
  id,
  answered: options.answered ?? true,
  yes: new Set(yes),
  maybe: new Set(maybe),
  unseen: new Set(options.unseen ?? []),
});

const WEEKEND = ['2027-03-06', '2027-03-07'];

describe('respondentOf', () => {
  const participant = (
    over: Partial<{
      answered: boolean;
      yes: string[];
      maybe: string[];
      unseen: string[];
    }> = {}
  ) => ({
    id: 'p1',
    answered: true,
    yes: ['2027-03-06'],
    maybe: ['2027-03-07'],
    unseen: [] as string[],
    ...over,
  });

  it('answers open on every day for someone who never answered', () => {
    const who = respondentOf(participant({ answered: false }));
    for (const day of ['2027-03-06', '2027-03-07', '2027-03-08'])
      expect(answerFor(who, day)).toBe('open');
  });

  it('answers open for an unseen day even when it is in yes', () => {
    const who = respondentOf(participant({ unseen: ['2027-03-06'] }));
    expect(answerFor(who, '2027-03-06')).toBe('open');
    expect(answerFor(who, '2027-03-07')).toBe('maybe');
  });

  it('turns empty lists into empty sets, and a day in none of them into no', () => {
    const who = respondentOf(participant({ yes: [], maybe: [] }));
    expect(who.yes.size).toBe(0);
    expect(who.maybe.size).toBe(0);
    expect(who.unseen.size).toBe(0);
    expect(answerFor(who, '2027-03-06')).toBe('no');
  });

  it('copies the lists', () => {
    const yes = ['2027-03-06'];
    const who = respondentOf(participant({ yes }));
    yes.push('2027-03-09');
    expect(who.yes.has('2027-03-09')).toBe(false);
  });
});

describe('answerFor', () => {
  it('reads yes, maybe and no', () => {
    const anna = person('anna', ['2027-03-06'], ['2027-03-07']);
    expect(answerFor(anna, '2027-03-06')).toBe('yes');
    expect(answerFor(anna, '2027-03-07')).toBe('maybe');
    expect(answerFor(anna, '2027-03-08')).toBe('no');
  });

  it('never counts someone who has not answered as a no', () => {
    expect(
      answerFor(person('ben', [], [], { answered: false }), '2027-03-06')
    ).toBe('open');
  });

  it('leaves days they have not seen open', () => {
    expect(
      answerFor(person('cem', [], [], { unseen: ['2027-03-06'] }), '2027-03-06')
    ).toBe('open');
  });
});

describe('blockAnswer', () => {
  it('needs every day for a yes', () => {
    expect(blockAnswer(person('a', WEEKEND), WEEKEND)).toBe('yes');
    expect(blockAnswer(person('a', [WEEKEND[0]!]), WEEKEND)).toBe('no');
  });

  it('is a maybe when one day is', () => {
    expect(
      blockAnswer(person('a', [WEEKEND[0]!], [WEEKEND[1]!]), WEEKEND)
    ).toBe('maybe');
  });

  it('lets a no outweigh an unseen day, and an unseen day outweigh a maybe', () => {
    expect(
      blockAnswer(person('a', [], [], { unseen: [WEEKEND[0]!] }), WEEKEND)
    ).toBe('no');
    expect(
      blockAnswer(
        person('a', [], [WEEKEND[1]!], { unseen: [WEEKEND[0]!] }),
        WEEKEND
      )
    ).toBe('open');
  });

  it('is open for someone who never answered', () => {
    expect(blockAnswer(person('a', [], [], { answered: false }), WEEKEND)).toBe(
      'open'
    );
  });
});

describe('candidateBlocks', () => {
  it('makes every day its own block for a duration of one', () => {
    expect(candidateBlocks(WEEKEND, 1)).toEqual([[WEEKEND[0]], [WEEKEND[1]]]);
  });

  it('finds only runs without gaps', () => {
    const days = [
      '2027-03-06',
      '2027-03-07',
      '2027-03-13',
      '2027-03-14',
      '2027-03-15',
    ];
    expect(candidateBlocks(days, 2)).toEqual([
      ['2027-03-06', '2027-03-07'],
      ['2027-03-13', '2027-03-14'],
      ['2027-03-14', '2027-03-15'],
    ]);
  });

  it('finds nothing when the duration is longer than any run, or nonsense', () => {
    expect(candidateBlocks(WEEKEND, 3)).toEqual([]);
    expect(candidateBlocks(WEEKEND, 0)).toEqual([]);
    expect(candidateBlocks([], 1)).toEqual([]);
  });

  it('crosses the turn of the month', () => {
    expect(candidateBlocks(['2027-02-28', '2027-03-01'], 2)).toHaveLength(1);
  });

  it('only ever yields consecutive days of the right length', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 31 }), { maxLength: 31 }),
        fc.integer({ min: 1, max: 5 }),
        (numbers, duration) => {
          const days = numbers
            .sort((a, b) => a - b)
            .map((n) => `2027-03-${String(n).padStart(2, '0')}`);
          for (const block of candidateBlocks(days, duration)) {
            expect(block).toHaveLength(duration);
            expect(block).toEqual(expandRange(block[0]!, block.at(-1)!));
          }
        }
      )
    );
  });
});

describe('blockFits', () => {
  const days = ['2027-03-05', '2027-03-06', '2027-03-07', '2027-03-09'];

  it('is true for a run of candidate days and false for a gap', () => {
    expect(blockFits(days, '2027-03-05', 2)).toBe(true);
    expect(blockFits(days, '2027-03-05', 3)).toBe(true);
    expect(blockFits(days, '2027-03-06', 2)).toBe(true);
    expect(blockFits(days, '2027-03-07', 2)).toBe(false);
    expect(blockFits(days, '2027-03-06', 4)).toBe(false);
  });

  it('is false without candidate days', () => {
    expect(blockFits([], '2027-03-05', 1)).toBe(false);
    expect(blockFits([], '2027-03-05', 3)).toBe(false);
  });

  it('asks for the day itself with a duration of one', () => {
    expect(blockFits(days, '2027-03-09', 1)).toBe(true);
    expect(blockFits(days, '2027-03-08', 1)).toBe(false);
    expect(blockFits(days, '2027-03-10', 1)).toBe(false);
  });

  it('finds a block that ends on the last candidate day', () => {
    expect(blockFits(days.slice(0, 3), '2027-03-06', 2)).toBe(true);
    expect(blockFits(days.slice(0, 3), '2027-03-07', 2)).toBe(false);
  });

  it('is false when the start is no candidate day, however many follow it', () => {
    expect(blockFits(days.slice(1), '2027-03-04', 2)).toBe(false);
    expect(blockFits(days.slice(1), '2027-03-04', 1)).toBe(false);
  });

  it('is false when the duration is longer than the whole set', () => {
    expect(blockFits(days, '2027-03-05', days.length + 1)).toBe(false);
    expect(blockFits(['2027-03-05'], '2027-03-05', 14)).toBe(false);
  });

  it('crosses the turn of a month, a year and a leap day', () => {
    expect(blockFits(['2027-02-28', '2027-03-01'], '2027-02-28', 2)).toBe(true);
    expect(blockFits(['2028-02-28', '2028-03-01'], '2028-02-28', 2)).toBe(
      false
    );
    expect(
      blockFits(['2028-02-28', '2028-02-29', '2028-03-01'], '2028-02-28', 3)
    ).toBe(true);
    expect(blockFits(['2026-12-31', '2027-01-01'], '2026-12-31', 2)).toBe(true);
  });

  it('takes any iterable, in any order, and counts a repeated day once', () => {
    const shuffled = ['2027-03-07', '2027-03-05', '2027-03-06', '2027-03-05'];
    expect(blockFits(shuffled, '2027-03-05', 3)).toBe(true);
    expect(blockFits(new Set(shuffled), '2027-03-05', 3)).toBe(true);
    expect(blockFits(shuffled.values(), '2027-03-05', 3)).toBe(true);
    expect(blockFits(['2027-03-05', '2027-03-05'], '2027-03-05', 2)).toBe(
      false
    );
  });

  it('answers false rather than throwing at the end of the calendar', () => {
    expect(blockFits([LAST_DAY], LAST_DAY, 1)).toBe(true);
    expect(blockFits([LAST_DAY], LAST_DAY, 2)).toBe(false);
    expect(blockFits([], LAST_DAY, 1)).toBe(false);
    expect(blockFits(['9999-12-30', LAST_DAY], '9999-12-30', 2)).toBe(true);
    expect(blockFits(['9999-12-30', LAST_DAY], LAST_DAY, 2)).toBe(false);
    expect(blockFits(['9999-12-30', LAST_DAY], '9999-12-30', 14)).toBe(false);
    expect(() => blockFits([LAST_DAY], LAST_DAY, 14)).not.toThrow();
  });

  it('works on the first day of the calendar', () => {
    expect(blockFits(['0000-01-01', '0000-01-02'], '0000-01-01', 2)).toBe(true);
    expect(blockFits(['0000-01-02'], '0000-01-01', 1)).toBe(false);
  });

  // The rule it replaced in the database: a block fits when exactly
  // `duration` distinct candidate days lie between its first and last day.
  const countingRule = (
    candidates: readonly string[],
    start: string,
    duration: number
  ): boolean => {
    const first = dayNumber(start);
    const last = first + duration - 1;
    if (last > dayNumber(LAST_DAY)) return false;
    const inside = new Set(
      candidates.map(dayNumber).filter((n) => n >= first && n <= last)
    );
    return inside.size === duration;
  };

  // Windows that cross a month, a leap day, a year and both ends of the calendar.
  const windows = [
    '2027-02-20',
    '2028-02-20',
    '2026-12-25',
    '9999-12-15',
    '0000-01-01',
  ];
  const inWindow = fc.record({
    base: fc.constantFrom(...windows),
    // Scattered days, or nearly all of them, so that long blocks fit now and then.
    offsets: fc.oneof(
      fc.uniqueArray(fc.integer({ min: 0, max: 16 }), { maxLength: 17 }),
      fc
        .uniqueArray(fc.integer({ min: 0, max: 16 }), { maxLength: 3 })
        .map((holes) =>
          Array.from({ length: 17 }, (_, n) => n).filter(
            (n) => !holes.includes(n)
          )
        )
    ),
    start: fc.integer({ min: 0, max: 16 }),
    duration: fc.integer({ min: 1, max: 14 }),
  });

  it('agrees with the counting rule it replaced', () => {
    fc.assert(
      fc.property(inWindow, ({ base, offsets, start, duration }) => {
        const candidates = offsets.map((n) => addDays(base, n));
        expect(blockFits(candidates, addDays(base, start), duration)).toBe(
          countingRule(candidates, addDays(base, start), duration)
        );
      }),
      { numRuns: 500 }
    );
  });

  it('agrees with candidateBlocks on where a block can start', () => {
    fc.assert(
      fc.property(inWindow, ({ base, offsets, start, duration }) => {
        const candidates = offsets
          .toSorted((a, b) => a - b)
          .map((n) => addDays(base, n));
        const begin = addDays(base, start);
        expect(blockFits(candidates, begin, duration)).toBe(
          candidateBlocks(candidates, duration).some(
            (block) => block[0] === begin
          )
        );
      }),
      { numRuns: 500 }
    );
  });
});

describe('rankBlocks', () => {
  const days = expandRange('2027-03-05', '2027-03-08');
  const people = [
    person('anna', ['2027-03-06', '2027-03-07']),
    person('ben', ['2027-03-07'], ['2027-03-06']),
    person('cem', ['2027-03-06', '2027-03-07', '2027-03-08']),
    person('dora', [], [], { answered: false }),
  ];

  it('ranks by yes, then maybe, then date', () => {
    const ranked = rankBlocks({
      candidates: days,
      people,
      duration: 1,
      minCount: null,
      today: '2027-03-01',
    });
    expect(ranked.map((block) => block.start)).toEqual([
      '2027-03-07',
      '2027-03-06',
      '2027-03-08',
      '2027-03-05',
    ]);
    expect(ranked[0]!.tally).toEqual({
      yes: ['anna', 'ben', 'cem'],
      maybe: [],
      no: [],
      open: ['dora'],
    });
    expect(ranked[1]!.tally.maybe).toEqual(['ben']);
  });

  it('ranks blocks of several days', () => {
    const ranked = rankBlocks({
      candidates: days,
      people,
      duration: 2,
      minCount: null,
      today: '2027-03-01',
    });
    expect(ranked[0]!).toMatchObject({
      start: '2027-03-06',
      end: '2027-03-07',
    });
    expect(ranked[0]!.tally).toEqual({
      yes: ['anna', 'cem'],
      maybe: ['ben'],
      no: [],
      open: ['dora'],
    });
  });

  it('flags blocks that reach the minimum, for sure or with the maybes', () => {
    const ranked = rankBlocks({
      candidates: days,
      people,
      duration: 2,
      minCount: 3,
      today: '2027-03-01',
    });
    expect(ranked[0]!.meetsMin).toBe(false);
    expect(ranked[0]!.mayMeetMin).toBe(true);
    const relaxed = rankBlocks({
      candidates: days,
      people,
      duration: 1,
      minCount: 3,
      today: '2027-03-01',
    });
    expect(relaxed[0]!.meetsMin).toBe(true);
  });

  it('counts without the people left out', () => {
    const ranked = rankBlocks({
      candidates: days,
      people,
      hidden: new Set(['anna', 'cem']),
      duration: 1,
      minCount: null,
      today: '2027-03-01',
    });
    expect(ranked[0]!.tally).toEqual({
      yes: ['ben'],
      maybe: [],
      no: [],
      open: ['dora'],
    });
  });

  it('leaves out blocks that have begun', () => {
    const ranked = rankBlocks({
      candidates: days,
      people,
      duration: 2,
      minCount: null,
      today: '2027-03-06',
    });
    expect(ranked.map((block) => block.start)).toEqual([
      '2027-03-06',
      '2027-03-07',
    ]);
  });

  it('ranks nothing without candidates or with everyone hidden', () => {
    expect(
      rankBlocks({
        candidates: [],
        people,
        duration: 1,
        minCount: null,
        today: '2027-03-01',
      })
    ).toEqual([]);
    const hidden = rankBlocks({
      candidates: days,
      people,
      hidden: new Set(people.map((p) => p.id)),
      duration: 1,
      minCount: 1,
      today: '2027-03-01',
    });
    expect(
      hidden.every((block) => block.tally.yes.length === 0 && !block.meetsMin)
    ).toBe(true);
  });
});

describe('heat', () => {
  it('is the share of those who answered, a maybe counting half', () => {
    expect(
      heatOf(
        tally(
          [person('a', ['d']), person('b', [], ['d']), person('c', [])],
          ['d']
        )
      )
    ).toBeCloseTo(0.5);
  });

  it('ignores people who have not answered', () => {
    expect(
      heatOf(
        tally(
          [person('a', ['d']), person('b', [], [], { answered: false })],
          ['d']
        )
      )
    ).toBe(1);
  });

  it('is zero when nobody answered', () => {
    expect(heatOf({ yes: [], maybe: [], no: [], open: ['x'] })).toBe(0);
  });

  it('maps to six steps, keeping any warmth above zero visible', () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(Number.NaN)).toBe(0);
    expect(heatLevel(0.01)).toBe(1);
    expect(heatLevel(0.5)).toBe(3);
    expect(heatLevel(1)).toBe(5);
    expect(heatLevel(7)).toBe(5);
  });
});
