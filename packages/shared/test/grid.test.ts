import { describe, expect, it } from 'vitest';
import {
  buildWeeks,
  expandRange,
  rowStartOf,
  type Weekday,
} from '../src/index.js';

const MONDAY: Weekday = 0;
const SUNDAY: Weekday = 6;

describe('rowStartOf', () => {
  it('finds the Monday at or before a day', () => {
    expect(rowStartOf('2026-10-05', MONDAY)).toBe('2026-10-05');
    expect(rowStartOf('2026-10-04', MONDAY)).toBe('2026-09-28');
  });

  it('finds the Sunday at or before a day', () => {
    expect(rowStartOf('2026-10-04', SUNDAY)).toBe('2026-10-04');
    expect(rowStartOf('2026-10-03', SUNDAY)).toBe('2026-09-27');
  });
});

describe('buildWeeks', () => {
  it('is empty without candidates', () => {
    expect(buildWeeks([], MONDAY)).toEqual([]);
  });

  it('holds a range within one week in one row', () => {
    const rows = buildWeeks(['2026-10-06', '2026-10-07'], MONDAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.days).toEqual(expandRange('2026-10-05', '2026-10-11'));
    expect(rows[0]!.monthLabel).toBe('2026-10');
    expect(rows[0]!.weekNumber).toBe(41);
    expect(rows[0]!.gapBefore).toBe(false);
  });

  it('shows only the weeks of the range, Monday first', () => {
    const rows = buildWeeks(expandRange('2026-10-02', '2026-10-11'), MONDAY);
    expect(rows.map((row) => row.start)).toEqual(['2026-09-28', '2026-10-05']);
    expect(rows.map((row) => row.monthLabel)).toEqual(['2026-10', null]);
  });

  it('lays rows out from Sunday when asked', () => {
    const rows = buildWeeks(['2026-10-04', '2026-10-10'], SUNDAY);
    expect(rows.map((row) => row.start)).toEqual(['2026-10-04']);
    expect(rows[0]!.days[6]).toBe('2026-10-10');
  });

  it('names a month that begins in the middle of the first row on the next row', () => {
    const rows = buildWeeks(expandRange('2026-09-30', '2026-10-08'), MONDAY);
    expect(rows.map((row) => row.monthLabel)).toEqual(['2026-09', '2026-10']);
  });

  it('names a new month on the row where it begins', () => {
    const rows = buildWeeks(expandRange('2026-10-19', '2026-11-08'), MONDAY);
    expect(rows.map((row) => row.monthLabel)).toEqual([
      '2026-10',
      '2026-11',
      null,
    ]);
  });

  it('crosses the turn of the year', () => {
    const rows = buildWeeks(expandRange('2026-12-28', '2027-01-10'), MONDAY);
    expect(rows.map((row) => row.monthLabel)).toEqual(['2026-12', '2027-01']);
    expect(rows.map((row) => row.weekNumber)).toEqual([53, 1]);
  });

  it('leaves out empty weeks and marks the gap', () => {
    const rows = buildWeeks(['2026-10-03', '2026-10-31'], MONDAY);
    expect(rows.map((row) => row.start)).toEqual(['2026-09-28', '2026-10-26']);
    expect(rows.map((row) => row.gapBefore)).toEqual([false, true]);
  });

  it('marks a gap only when a whole week is skipped', () => {
    // Rows 7 days apart touch; rows 14 days apart have a week between them.
    const touching = buildWeeks(['2026-10-05', '2026-10-12'], MONDAY);
    expect(touching.map((row) => row.gapBefore)).toEqual([false, false]);
    const apart = buildWeeks(['2026-10-05', '2026-10-19'], MONDAY);
    expect(apart.map((row) => row.gapBefore)).toEqual([false, true]);
    // Across the turn of the year.
    const year = buildWeeks(['2026-12-28', '2027-01-11'], MONDAY);
    expect(year.map((row) => row.gapBefore)).toEqual([false, true]);
  });

  it('ignores the order and duplicates of its input', () => {
    expect(
      buildWeeks(['2026-10-10', '2026-10-03', '2026-10-03'], MONDAY)
    ).toEqual(buildWeeks(['2026-10-03', '2026-10-10'], MONDAY));
  });
});
