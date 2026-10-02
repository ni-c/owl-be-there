import type { ISODate } from './dates.js';

/** What a participant can say about a day. Unmarked means "no". */
export type Mark = 'yes' | 'maybe';

/** A participant's marks: every day not in the map is a "no". */
export type Marks = ReadonlyMap<ISODate, Mark>;

/** A position in the calendar grid. */
export interface Cell {
  row: number;
  col: number;
}

/** Where the day cells sit on screen, in the coordinates pointer events use. */
export interface GridGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  rows: number;
  cols: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * The cell under a point, clamped to the grid.
 *
 * Geometry rather than the event's target, because a touch pointer is captured
 * by the element it went down on: for the whole drag, `event.target` stays the
 * start cell and `pointerenter` never fires on the others. Clamped, so a finger
 * that slides past the edge keeps extending the selection along that edge
 * instead of dropping it.
 */
export function cellAt(geometry: GridGeometry, x: number, y: number): Cell {
  const { left, top, width, height, rows, cols } = geometry;
  const col = Math.floor(((x - left) / width) * cols);
  const row = Math.floor(((y - top) / height) * rows);
  return {
    row: clamp(Number.isFinite(row) ? row : 0, 0, rows - 1),
    col: clamp(Number.isFinite(col) ? col : 0, 0, cols - 1),
  };
}

/**
 * Every cell of the rectangle two corners span, row by row.
 *
 * Which corner the drag started from does not matter — dragging up and to the
 * left selects the same block as dragging down and to the right.
 */
export function cellsInRect(a: Cell, b: Cell): Cell[] {
  const cells: Cell[] = [];
  for (
    let row = Math.min(a.row, b.row);
    row <= Math.max(a.row, b.row);
    row += 1
  ) {
    for (
      let col = Math.min(a.col, b.col);
      col <= Math.max(a.col, b.col);
      col += 1
    ) {
      cells.push({ row, col });
    }
  }
  return cells;
}

/** Whether a stroke adds the brush or takes it away. */
export type StrokeMode = 'set' | 'erase';

/**
 * The first cell decides, as in Crab Fit: starting on a day that already
 * carries the brush erases, starting anywhere else paints. One rule for taps
 * and drags alike, so a tap is simply a stroke that never left its cell.
 */
export function strokeModeFor(
  marks: Marks,
  start: ISODate,
  brush: Mark
): StrokeMode {
  return marks.get(start) === brush ? 'erase' : 'set';
}

/**
 * The marks after a stroke over `days`.
 *
 * Painting gives every day the brush, overwriting the other mark. Erasing
 * clears only days that carry the brush: sweeping the "yes" brush back over a
 * row takes the yeses away and leaves the maybes where they were.
 */
export function applyStroke(
  marks: Marks,
  days: readonly ISODate[],
  brush: Mark,
  mode: StrokeMode
): Map<ISODate, Mark> {
  const next = new Map(marks);
  for (const day of days) {
    if (mode === 'set') next.set(day, brush);
    else if (next.get(day) === brush) next.delete(day);
  }
  return next;
}

/** A tap on one day: on in the brush's colour, or off if it already was. */
export function tapDay(
  marks: Marks,
  day: ISODate,
  brush: Mark
): Map<ISODate, Mark> {
  return applyStroke(marks, [day], brush, strokeModeFor(marks, day, brush));
}

/** Whether two sets of marks say exactly the same thing. */
export function sameMarks(a: Marks, b: Marks): boolean {
  if (a.size !== b.size) return false;
  for (const [day, mark] of a) if (b.get(day) !== mark) return false;
  return true;
}

/** Marks as the two sorted lists the API carries. */
export function splitMarks(marks: Marks): { yes: ISODate[]; maybe: ISODate[] } {
  const yes: ISODate[] = [];
  const maybe: ISODate[] = [];
  for (const [day, mark] of marks) (mark === 'yes' ? yes : maybe).push(day);
  return { yes: yes.sort(), maybe: maybe.sort() };
}

/** The two lists the API carries, as marks. A day in both is a "yes". */
export function joinMarks(
  yes: readonly ISODate[],
  maybe: readonly ISODate[]
): Map<ISODate, Mark> {
  const marks = new Map<ISODate, Mark>();
  for (const day of maybe) marks.set(day, 'maybe');
  for (const day of yes) marks.set(day, 'yes');
  return marks;
}
