import { describe, expect, it } from 'vitest';
import {
  EventSnapshot,
  exampleSnapshot,
  marksOf,
  monthAfter,
  PEOPLE,
  splitMarks,
} from '../src/index.js';

describe('monthAfter', () => {
  it('takes the whole of the next month', () => {
    const days = monthAfter('2026-10-04');
    expect(days).toHaveLength(30);
    expect(days[0]).toBe('2026-11-01');
    expect(days.at(-1)).toBe('2026-11-30');
  });

  it('crosses into the next year from December', () => {
    const days = monthAfter('2026-12-31');
    expect(days[0]).toBe('2027-01-01');
    expect(days).toHaveLength(31);
  });

  it('knows February in common and in leap years', () => {
    expect(monthAfter('2027-01-31')).toHaveLength(28);
    expect(monthAfter('2028-01-01').at(-1)).toBe('2028-02-29');
  });

  it('does not care which day of the month it is', () => {
    expect(monthAfter('2026-10-01')).toEqual(monthAfter('2026-10-31'));
    expect(monthAfter('2027-02-28')).toEqual(monthAfter('2027-02-01'));
  });
});

describe('the example people', () => {
  it('are ten, Anna first, no name twice', () => {
    expect(PEOPLE).toHaveLength(10);
    expect(PEOPLE[0]!.name).toBe('Anna');
    expect(new Set(PEOPLE.map((p) => p.name)).size).toBe(10);
  });

  it('give every month one clear best day and several that reach six', () => {
    for (let year = 2026; year <= 2028; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const days = monthAfter(`${year}-${String(month).padStart(2, '0')}-01`);
        const yes = new Map(days.map((day) => [day, 0]));
        for (const person of PEOPLE) {
          for (const day of splitMarks(marksOf(person.rule, days)).yes) {
            yes.set(day, yes.get(day)! + 1);
          }
        }
        const counts = [...yes.values()].sort((a, b) => b - a);
        const label = days[0]!.slice(0, 7);
        expect(counts[0], label).toBeGreaterThanOrEqual(8);
        expect(counts[1], label).toBeLessThan(counts[0]!);
        expect(counts.filter((n) => n >= 6).length, label).toBeGreaterThan(2);
      }
    }
  });

  it('mark nothing for no days', () => {
    expect(marksOf(PEOPLE[0]!.rule, []).size).toBe(0);
  });
});

describe('exampleSnapshot', () => {
  const today = '2026-10-04';
  const days = monthAfter(today);
  const anna = marksOf(PEOPLE[0]!.rule, days);

  it('is an event as the server sends it', () => {
    const snapshot = exampleSnapshot({ today, title: 'Team dinner', anna });
    expect(() => EventSnapshot.parse(snapshot)).not.toThrow();
    expect(snapshot.event).toMatchObject({
      title: 'Team dinner',
      emoji: 'drinks',
      durationDays: 1,
      minCount: 6,
      status: 'open',
      days,
    });
    expect(snapshot.participants.map((p) => p.name)).toEqual(
      PEOPLE.map((p) => p.name)
    );
    expect(new Set(snapshot.participants.map((p) => p.id)).size).toBe(10);
  });

  it('takes Anna’s marks from the caller', () => {
    const painted = new Map([
      ['2026-11-02', 'yes' as const],
      ['2026-11-03', 'maybe' as const],
    ]);
    const first = exampleSnapshot({ today, title: 'x', anna: painted })
      .participants[0]!;
    expect(first).toMatchObject({
      answered: true,
      yes: ['2026-11-02'],
      maybe: ['2026-11-03'],
    });
  });

  it('shows Anna as not answered once she has no days', () => {
    const first = exampleSnapshot({ today, title: 'x', anna: new Map() })
      .participants[0]!;
    expect(first).toMatchObject({ answered: false, yes: [], maybe: [] });
    // Everybody else has answered regardless.
    expect(
      exampleSnapshot({ today, title: 'x', anna: new Map() })
        .participants.slice(1)
        .every((p) => p.answered)
    ).toBe(true);
  });
});
