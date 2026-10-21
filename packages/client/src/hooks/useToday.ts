import { todayLocal, type ISODate } from '@owl/shared';
import { useEffect, useState } from 'react';

/** Slack after midnight, so a timer that fires a hair early still crosses it. */
const MIDNIGHT_SLACK_MS = 50;

/**
 * Call `onChange` with the new day when the local date changes: at the next
 * midnight, and when the page becomes visible again (a sleeping tab's timers
 * are late). Returns the stop function.
 */
export function watchToday(
  onChange: (day: ISODate) => void,
  now: () => Date = () => new Date()
): () => void {
  let current = todayLocal(now());
  let timer: ReturnType<typeof setTimeout> | null = null;
  const check = (): void => {
    const next = todayLocal(now());
    if (next === current) return;
    current = next;
    onChange(next);
  };
  const arm = (): void => {
    if (timer) clearTimeout(timer);
    const at = now();
    const midnight = new Date(
      at.getFullYear(),
      at.getMonth(),
      at.getDate() + 1
    );
    timer = setTimeout(
      () => {
        check();
        arm();
      },
      midnight.getTime() - at.getTime() + MIDNIGHT_SLACK_MS
    );
  };
  const onVisible = (): void => {
    if (document.visibilityState !== 'visible') return;
    check();
    arm();
  };
  document.addEventListener('visibilitychange', onVisible);
  arm();
  return () => {
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Today's local date, kept current while the page stays open. */
export function useToday(): ISODate {
  const [today, setToday] = useState(() => todayLocal());
  useEffect(() => {
    // The day may have turned between the first render and the effect.
    setToday(todayLocal());
    return watchToday(setToday);
  }, []);
  return today;
}
