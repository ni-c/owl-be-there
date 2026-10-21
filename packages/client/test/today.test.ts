import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchToday } from '../src/hooks/useToday.ts';
import { installBrowser } from './browser.ts';

let browser: ReturnType<typeof installBrowser>;

beforeEach(() => {
  vi.useFakeTimers();
  browser = installBrowser();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('watchToday', () => {
  it('announces the new day at local midnight, and again the next midnight', () => {
    vi.setSystemTime(new Date(2027, 2, 6, 23, 59, 0));
    const seen: string[] = [];
    const stop = watchToday((day) => seen.push(day));
    vi.advanceTimersByTime(30_000);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(31_000);
    expect(seen).toEqual(['2027-03-07']);
    vi.advanceTimersByTime(24 * 3600_000);
    expect(seen).toEqual(['2027-03-07', '2027-03-08']);
    stop();
  });

  it('catches up when the page becomes visible after a sleep, once', () => {
    vi.setSystemTime(new Date(2027, 2, 6, 12, 0, 0));
    const seen: string[] = [];
    const stop = watchToday((day) => seen.push(day));
    // Time jumps while timers are frozen, as on a sleeping laptop.
    vi.setSystemTime(new Date(2027, 2, 9, 8, 0, 0));
    browser.document.visibilityState = 'hidden';
    browser.document.dispatch('visibilitychange');
    expect(seen).toEqual([]);
    browser.document.visibilityState = 'visible';
    browser.document.dispatch('visibilitychange');
    browser.document.dispatch('visibilitychange');
    expect(seen).toEqual(['2027-03-09']);
    stop();
  });

  it('crosses midnight on the days the clocks change', () => {
    // 2027-03-28: 23 hours in Europe; 2027-10-31: 25 hours. Whatever the zone,
    // the next day is announced exactly once when the date turns.
    for (const start of [
      new Date(2027, 2, 28, 23, 0, 0),
      new Date(2027, 9, 31, 23, 0, 0),
    ]) {
      vi.setSystemTime(start);
      const seen: string[] = [];
      const stop = watchToday((day) => seen.push(day));
      vi.advanceTimersByTime(2 * 3600_000);
      expect(seen).toHaveLength(1);
      stop();
    }
  });

  it('stops listening and timing on stop', () => {
    vi.setSystemTime(new Date(2027, 2, 6, 23, 59, 59));
    const seen: string[] = [];
    const stop = watchToday((day) => seen.push(day));
    expect(browser.document.listenerCount('visibilitychange')).toBe(1);
    stop();
    expect(browser.document.listenerCount('visibilitychange')).toBe(0);
    vi.advanceTimersByTime(48 * 3600_000);
    expect(seen).toEqual([]);
  });
});
