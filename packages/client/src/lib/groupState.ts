import type { ISODate, RankedBlock } from '@owl/shared';

/** The hidden people who are still in the snapshot; the same set if all are. */
export function liveHidden(
  hidden: Set<string>,
  known: ReadonlyMap<string, unknown>
): Set<string> {
  const live = new Set<string>();
  for (const id of hidden) if (known.has(id)) live.add(id);
  return live.size === hidden.size ? hidden : live;
}

/**
 * The selected block as the current ranking has it, or none when it is no
 * longer among the blocks shown. Matched by start day: the block's days and
 * tally follow the snapshot.
 */
export function liveSelection(
  selected: Pick<RankedBlock, 'start'> | null,
  shown: readonly RankedBlock[]
): RankedBlock | null {
  if (!selected) return null;
  return shown.find((block) => block.start === selected.start) ?? null;
}

/** The open day sheet, unless its day has gone or nobody has answered. */
export function liveOpenDay(
  openDay: ISODate | null,
  days: readonly ISODate[],
  anyAnswered: boolean
): ISODate | null {
  return openDay && anyAnswered && days.includes(openDay) ? openDay : null;
}
