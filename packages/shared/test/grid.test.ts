import { describe, expect, it } from 'vitest';
import {
  buildWeeks,
  expandRange,
  isOnPage,
  paginate,
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

  it('ignores the order and duplicates of its input', () => {
    expect(
      buildWeeks(['2026-10-10', '2026-10-03', '2026-10-03'], MONDAY)
    ).toEqual(buildWeeks(['2026-10-03', '2026-10-10'], MONDAY));
  });
});

describe('paginate', () => {
  const days = expandRange('2026-10-01', '2026-12-31');
  const rows = buildWeeks(days, MONDAY);

  it('keeps everything on one page when it fits', () => {
    const pages = paginate(rows, days, rows.length);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.month).toBeNull();
    expect(isOnPage(pages[0]!, '2026-11-15')).toBe(true);
  });

  it('splits by month when it does not, sharing the weeks that straddle', () => {
    const pages = paginate(rows, days, 6);
    expect(pages.map((page) => page.month)).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
    // 26 October to 1 November is on the October page and the November page.
    expect(pages[0]!.rows.at(-1)!.start).toBe('2026-10-26');
    expect(pages[1]!.rows[0]!.start).toBe('2026-10-26');
    expect(isOnPage(pages[1]!, '2026-10-31')).toBe(false);
    expect(isOnPage(pages[1]!, '2026-11-01')).toBe(true);
    for (const page of pages) expect(page.rows.length).toBeLessThanOrEqual(6);
  });

  it('treats a limit below one as one row', () => {
    expect(paginate(rows.slice(0, 1), days, 0)).toHaveLength(1);
  });

  it('gives one empty page for no rows', () => {
    expect(paginate([], [], 6)).toEqual([
      { key: 'all', month: null, rows: [] },
    ]);
  });
});
