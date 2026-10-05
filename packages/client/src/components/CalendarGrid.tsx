import {
  addDays,
  applyStroke,
  buildWeeks,
  compareISODate,
  formatDay,
  strokeModeFor,
  tapDay,
  toggleDays,
  weekdayOf,
  WEEKDAYS,
  type ISODate,
  type Mark,
  type Marks,
  type StrokeMode,
  type WeekRow,
  type Weekday,
} from '@owl/shared';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useI18n } from '../i18n/index.tsx';

export interface HeatInfo {
  level: 0 | 1 | 2 | 3 | 4 | 5;
  yes: number;
  maybe: number;
  no: number;
}

export interface HintInfo {
  yes: number;
  maybe: number;
  total: number;
}

interface BaseProps {
  /** The days that are cells: the candidates, or the whole range when choosing them. */
  days: readonly ISODate[];
  firstWeekday: Weekday;
  today: ISODate;
  label: string;
}

interface PaintProps extends BaseProps {
  mode: 'paint' | 'candidates';
  marks: Marks;
  brush: Mark;
  /** A finished stroke, tap or toggle, with how many days it changed. */
  onChange(next: Map<ISODate, Mark>, changed: number): void;
  disabled?: boolean;
  hints?: ReadonlyMap<ISODate, HintInfo>;
  unseen?: ReadonlySet<ISODate>;
  onBrushChange?(brush: Mark): void;
  onUndo?(): void;
}

interface HeatProps extends BaseProps {
  mode: 'heat';
  heat: ReadonlyMap<ISODate, HeatInfo>;
  highlighted?: ReadonlySet<ISODate>;
  selected?: ReadonlySet<ISODate>;
  onDayClick(day: ISODate): void;
}

export type CalendarGridProps = PaintProps | HeatProps;

interface Position {
  row: number;
  col: number;
}

interface Stroke {
  pointerId: number;
  start: Position;
  current: Position;
  mode: StrokeMode;
  moved: boolean;
}

/** The week rows for a set of days: always the whole range, never paged. */
export function useWeeks(
  days: readonly ISODate[],
  firstWeekday: Weekday
): WeekRow[] {
  return useMemo(() => buildWeeks(days, firstWeekday), [days, firstWeekday]);
}

export function CalendarGrid(props: CalendarGridProps) {
  const { days, firstWeekday, today, label } = props;
  const { t, tn, locale } = useI18n();
  const rows = useWeeks(days, firstWeekday);
  const daySet = useMemo(() => new Set(days), [days]);
  const paint = props.mode !== 'heat';
  const disabled = paint && Boolean((props as PaintProps).disabled);

  const selectable = useCallback(
    (day: ISODate): boolean =>
      daySet.has(day) && compareISODate(day, today) >= 0,
    [daySet, today]
  );

  // Where each day sits in the grid, for the rectangle.
  const positions = useMemo(() => {
    const map = new Map<ISODate, Position>();
    rows.forEach((row, rowIndex) =>
      row.days.forEach((day, col) => map.set(day, { row: rowIndex, col }))
    );
    return map;
  }, [rows]);

  const daysInRect = useCallback(
    (a: Position, b: Position): ISODate[] => {
      const result: ISODate[] = [];
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
          const day = rows[row]?.days[col];
          if (day && selectable(day)) result.push(day);
        }
      }
      return result;
    },
    [rows, selectable]
  );

  /* ------------------------------------------------------- the paint engine */

  const [stroke, setStroke] = useState<Stroke | null>(null);
  const strokeRef = useRef<Stroke | null>(null);
  const suppressClickUntil = useRef(0);
  // Where a keyboard selection with Shift started; it ends with the selection.
  const [anchor, setAnchor] = useState<ISODate | null>(null);
  const frame = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const marks = paint ? (props as PaintProps).marks : null;
  const brush = paint ? (props as PaintProps).brush : 'yes';

  const preview = useMemo(() => {
    if (!stroke || !marks) return null;
    const rectDays = daysInRect(stroke.start, stroke.current);
    return {
      days: new Set(rectDays),
      marks: applyStroke(marks, rectDays, brush, stroke.mode),
    };
  }, [stroke, marks, brush, daysInRect]);

  const commit = useCallback(
    (next: Map<ISODate, Mark>, changed: number) => {
      if (paint && changed > 0) (props as PaintProps).onChange(next, changed);
    },
    // `props` changes identity every render; the handler is read at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paint, (props as PaintProps).onChange]
  );

  const countChanges = (
    before: Marks,
    after: Marks,
    scope: Iterable<ISODate>
  ): number => {
    let changed = 0;
    for (const day of scope)
      if (before.get(day) !== after.get(day)) changed += 1;
    return changed;
  };

  const positionAt = useCallback(
    (x: number, y: number): Position | null => {
      const element = document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>('[data-day]');
      const day = element?.dataset.day;
      if (!day || !bodyRef.current?.contains(element)) return null;
      return positions.get(day) ?? null;
    },
    [positions]
  );

  const endStroke = useCallback(
    (commitIt: boolean) => {
      const current = strokeRef.current;
      strokeRef.current = null;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      setStroke(null);
      if (!current || !marks) return;
      if (commitIt && current.moved) {
        const rectDays = daysInRect(current.start, current.current);
        const next = applyStroke(marks, rectDays, brush, current.mode);
        commit(next, countChanges(marks, next, rectDays));
        // The click that follows the release must not toggle a day as well.
        suppressClickUntil.current = Date.now() + 500;
      }
    },
    [marks, brush, daysInRect, commit]
  );

  useEffect(() => {
    if (!stroke) return;
    const pointerId = stroke.pointerId;
    // The rectangle follows the pointer once per frame, to the latest point
    // seen in that frame.
    let latest: { x: number; y: number } | null = null;
    const follow = (x: number, y: number) => {
      const position = positionAt(x, y);
      const current = strokeRef.current;
      if (!position || !current) return;
      if (
        position.row === current.current.row &&
        position.col === current.current.col
      )
        return;
      const moved =
        current.moved ||
        position.row !== current.start.row ||
        position.col !== current.start.col;
      const next = { ...current, current: position, moved };
      strokeRef.current = next;
      setStroke(next);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      // The button was released where no release event reached the page.
      if (event.pointerType === 'mouse' && event.buttons === 0) {
        endStroke(false);
        return;
      }
      latest = { x: event.clientX, y: event.clientY };
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (latest) follow(latest.x, latest.y);
      });
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      // A quick flick can end before the next frame: where the pointer was
      // released still counts.
      follow(event.clientX, event.clientY);
      endStroke(true);
    };
    const onCancel = (event: PointerEvent) => {
      if (event.pointerId === pointerId) endStroke(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') endStroke(false);
    };
    // The page lost the pointer — another window, another tab — and the
    // release will not come.
    const onAway = () => endStroke(false);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') endStroke(false);
    };
    // A safety net for iOS: once a drag is under way, the page must not scroll.
    const onTouchMove = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onAway);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onAway);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('touchmove', onTouchMove);
    };
    // Re-subscribing on every move would drop events; only the pointer matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stroke?.pointerId, endStroke, positionAt]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    setAnchor(null);
    if (!paint || disabled || !marks) return;
    if (!event.isPrimary) return;
    // A stroke still open at a new primary press lost its end: drop it.
    if (strokeRef.current) endStroke(false);
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // The click that followed an earlier drag has come and gone by now.
    suppressClickUntil.current = 0;
    const position = positionAt(event.clientX, event.clientY);
    if (!position) return;
    const day = rows[position.row]?.days[position.col];
    if (!day || !selectable(day)) return;
    try {
      (event.target as Element).releasePointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointers have nothing to release.
    }
    const next: Stroke = {
      pointerId: event.pointerId,
      start: position,
      current: position,
      mode: strokeModeFor(marks, day, brush),
      moved: false,
    };
    strokeRef.current = next;
    setStroke(next);
  };

  const onDayClick = (day: ISODate) => {
    setAnchor(null);
    if (props.mode === 'heat') {
      props.onDayClick(day);
      return;
    }
    if (disabled || !marks || Date.now() < suppressClickUntil.current) return;
    if (!selectable(day)) return;
    const next = tapDay(marks, day, brush);
    commit(next, countChanges(marks, next, [day]));
  };

  /* ------------------------------------------------------------ keyboard */

  const [focused, setFocused] = useState<ISODate | null>(null);
  const buttons = useRef(new Map<ISODate, HTMLButtonElement>());

  const focusable = useMemo(() => {
    const list: ISODate[] = [];
    for (const row of rows)
      for (const day of row.days) if (daySet.has(day)) list.push(day);
    return list;
  }, [rows, daySet]);

  const tabStop =
    focused && focusable.includes(focused)
      ? focused
      : (focusable.find((d) => compareISODate(d, today) >= 0) ??
        focusable[0] ??
        null);

  // Keyboard moves put the focus on the day themselves, so that a later
  // snapshot never has a reason to take it from wherever it has gone since.
  const focusDay = (day: ISODate) => {
    setFocused(day);
    buttons.current.get(day)?.focus();
  };

  const move = (from: ISODate, dRow: number, dCol: number): ISODate | null => {
    const start = positions.get(from);
    if (!start) return null;
    let { row, col } = start;
    for (;;) {
      row += dRow;
      col += dCol;
      if (col < 0) {
        col = 6;
        row -= 1;
      } else if (col > 6) {
        col = 0;
        row += 1;
      }
      if (row < 0 || row >= rows.length) return null;
      const day = rows[row]!.days[col]!;
      if (daySet.has(day)) return day;
    }
  };

  const keyboardPreview = useMemo(() => {
    if (!paint || disabled || !marks || !anchor || !focused) return null;
    const a = positions.get(anchor);
    const b = positions.get(focused);
    if (!a || !b) return null;
    const rectDays = daysInRect(a, b);
    // As with a pointer stroke, the first day that can be painted decides
    // between painting and erasing; the anchor may be a past day.
    const first = selectable(anchor) ? anchor : rectDays[0];
    return {
      days: new Set(rectDays),
      marks: applyStroke(
        marks,
        rectDays,
        brush,
        first ? strokeModeFor(marks, first, brush) : 'set'
      ),
    };
  }, [
    paint,
    disabled,
    marks,
    anchor,
    focused,
    positions,
    daysInRect,
    selectable,
    brush,
  ]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).dataset.day;
    if (!target) return;
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };
    const step = steps[event.key];
    if (step) {
      event.preventDefault();
      const next = move(target, step[0], step[1]);
      if (paint && !disabled && event.shiftKey)
        setAnchor((current) => current ?? target);
      else setAnchor(null);
      if (next) focusDay(next);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const row = rows[positions.get(target)?.row ?? 0]!;
      const inRow = row.days.filter((day) => daySet.has(day));
      const next = event.key === 'Home' ? inRow[0] : inRow[inRow.length - 1];
      if (paint && !disabled && event.shiftKey)
        setAnchor((current) => current ?? target);
      else setAnchor(null);
      if (next) focusDay(next);
      return;
    }
    if (!paint || disabled) return;
    const paintProps = props as PaintProps;
    if ((event.key === ' ' || event.key === 'Enter') && keyboardPreview) {
      event.preventDefault();
      commit(
        keyboardPreview.marks,
        countChanges(marks!, keyboardPreview.marks, keyboardPreview.days)
      );
      setAnchor(null);
      return;
    }
    if (event.key === 'Escape' && anchor) {
      setAnchor(null);
      return;
    }
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    if (plain && (event.key === 'y' || event.key === 'Y')) {
      paintProps.onBrushChange?.('yes');
    } else if (
      plain &&
      (event.key === 'm' || event.key === 'M' || event.key === '?')
    ) {
      paintProps.onBrushChange?.('maybe');
    } else if (
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === 'z' &&
      paintProps.onUndo
    ) {
      event.preventDefault();
      paintProps.onUndo();
    }
  };

  /* --------------------------------------------------------- the toggles */

  const toggleTargets = (targets: ISODate[]) => {
    if (!marks || disabled) return;
    const result = toggleDays(marks, targets, brush);
    commit(result.marks, result.changed);
  };

  const weekdayTargets = (weekday: Weekday): ISODate[] =>
    // "Every Saturday" means every one in the range.
    days.filter(
      (day) => weekdayOf(day) === weekday && compareISODate(day, today) >= 0
    );

  /* ------------------------------------------------------------ rendering */

  const shownMarks = preview?.marks ?? keyboardPreview?.marks ?? marks;
  const previewDays = preview?.days ?? keyboardPreview?.days ?? null;
  const weekdayOrder = WEEKDAYS.map(
    (offset) => ((firstWeekday + offset) % 7) as Weekday
  );
  // 2024-01-01 was a Monday: a fixed week to take weekday names from.
  const weekdayName = (weekday: Weekday, style: 'short' | 'long') =>
    formatDay(addDays('2024-01-01', weekday), locale, { weekday: style });
  const monthName = (monthKey: string, style: 'short' | 'long') =>
    formatDay(`${monthKey}-01`, locale, {
      month: style,
      ...(style === 'long' && { year: 'numeric' }),
    });

  const stateLabel = (day: ISODate): string => {
    if (props.mode === 'heat') {
      const info = props.heat.get(day);
      return info
        ? t('cal.heat', { yes: info.yes, maybe: info.maybe, no: info.no })
        : '';
    }
    const state = shownMarks?.get(day);
    if (props.mode === 'candidates') return state ? t('cal.on') : t('cal.off');
    return state === 'yes'
      ? t('cal.yes')
      : state === 'maybe'
        ? t('cal.maybe')
        : t('cal.no');
  };

  return (
    <div className={`cal ${paint && !disabled ? 'cal-paint' : ''}`}>
      <div
        role="grid"
        aria-label={label}
        aria-readonly={!paint || disabled}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          // A selection does not outlast the focus leaving the grid.
          if (!event.currentTarget.contains(event.relatedTarget))
            setAnchor(null);
        }}
      >
        <div role="row" className="cal-head mb-1">
          <span role="columnheader" aria-hidden="true" />
          {weekdayOrder.map((weekday) => (
            <span
              role="columnheader"
              key={weekday}
              className="grid place-items-center"
            >
              {paint && !disabled ? (
                <button
                  type="button"
                  className="min-h-9 w-full rounded-lg text-sm font-bold text-muted hover:bg-sunken hover:text-ink"
                  onClick={() => toggleTargets(weekdayTargets(weekday))}
                  aria-label={t('cal.weekdayAll', {
                    weekday: weekdayName(weekday, 'long'),
                  })}
                  tabIndex={-1}
                >
                  {weekdayName(weekday, 'short')}
                </button>
              ) : (
                <span className="text-sm font-bold text-muted">
                  <abbr
                    title={weekdayName(weekday, 'long')}
                    className="no-underline"
                  >
                    {weekdayName(weekday, 'short')}
                  </abbr>
                </span>
              )}
            </span>
          ))}
        </div>
        <div
          ref={bodyRef}
          className="cal-body flex flex-col gap-1"
          onPointerDown={onPointerDown}
        >
          {rows.map((row) => {
            const weekTargets = row.days.filter((day) => selectable(day));
            return (
              <div role="row" className="cal-row" key={row.start}>
                <span
                  role="rowheader"
                  className="flex flex-col items-center justify-center text-xs leading-tight text-muted"
                >
                  {row.gapBefore && (
                    <span
                      aria-label={t('cal.gap')}
                      role="img"
                      className="-mt-1 text-base leading-none"
                    >
                      ⋮
                    </span>
                  )}
                  {row.monthLabel && (
                    <span className="font-extrabold text-ink">
                      {monthName(row.monthLabel, 'short')}
                    </span>
                  )}
                  {paint && !disabled && weekTargets.length > 0 ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      className="rounded-md px-1 py-0.5 hover:bg-sunken hover:text-ink"
                      onClick={() => toggleTargets(weekTargets)}
                      aria-label={t('cal.weekToggle', {
                        number: row.weekNumber,
                      })}
                    >
                      {t('cal.week', { number: row.weekNumber })}
                    </button>
                  ) : (
                    <span aria-hidden="true">
                      {t('cal.week', { number: row.weekNumber })}
                    </span>
                  )}
                </span>
                {row.days.map((day) => {
                  const inSet = daySet.has(day);
                  const past = compareISODate(day, today) < 0;
                  const number = Number(day.slice(8));
                  const monthStart = number === 1 && inSet;
                  if (!inSet) {
                    return (
                      <div role="gridcell" key={day} aria-hidden="true">
                        <div
                          className="cal-cell text-sm"
                          data-kind="outside"
                          data-month-start={monthStart}
                        >
                          {number}
                        </div>
                      </div>
                    );
                  }
                  const fullDate = formatDay(day, locale, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  });
                  const common = {
                    'data-day': day,
                    'data-month-start': monthStart,
                    tabIndex: day === tabStop ? 0 : -1,
                    ref: (element: HTMLButtonElement | null) => {
                      if (element) buttons.current.set(day, element);
                      else buttons.current.delete(day);
                    },
                    onFocus: () => setFocused(day),
                    onClick: () => onDayClick(day),
                  };
                  if (props.mode === 'heat') {
                    const info = props.heat.get(day);
                    return (
                      <div role="gridcell" key={day}>
                        <button
                          type="button"
                          {...common}
                          className="cal-cell w-full"
                          data-heat={info?.level ?? 0}
                          data-kind={past ? 'past' : 'day'}
                          data-best={props.highlighted?.has(day) ?? false}
                          data-selected={props.selected?.has(day) ?? false}
                          aria-label={`${fullDate}: ${stateLabel(day)}`}
                        >
                          <span className="absolute top-1 left-1.5 text-[0.65rem] font-bold">
                            {number}
                          </span>
                          {info && info.yes + info.maybe > 0 && (
                            <span className="text-lg font-black">
                              {info.yes}
                            </span>
                          )}
                          {info && info.maybe > 0 && (
                            <span className="text-[0.65rem] font-bold">
                              +{info.maybe}?
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  }
                  const paintProps = props as PaintProps;
                  const state = shownMarks?.get(day);
                  const candidateState = state ? 'on' : 'off';
                  const hint = paintProps.hints?.get(day);
                  const unseen = paintProps.unseen?.has(day) ?? false;
                  const canPaint = selectable(day) && !disabled;
                  return (
                    <div role="gridcell" key={day}>
                      <button
                        type="button"
                        {...common}
                        className="cal-cell w-full font-extrabold"
                        data-kind={past ? 'past' : 'day'}
                        data-state={
                          props.mode === 'candidates'
                            ? candidateState
                            : (state ?? 'none')
                        }
                        data-preview={previewDays?.has(day) ?? false}
                        aria-pressed={
                          props.mode === 'candidates'
                            ? Boolean(state)
                            : state === 'yes'
                              ? true
                              : state === 'maybe'
                                ? 'mixed'
                                : false
                        }
                        aria-disabled={!canPaint}
                        aria-label={`${fullDate}: ${stateLabel(day)}${unseen ? `, ${t('cal.new')}` : ''}${past ? `, ${t('cal.past')}` : ''}${hint ? `, ${tn('cal.othersCan', hint.yes)}` : ''}`}
                      >
                        <span className="text-base">{number}</span>
                        {props.mode === 'paint' && (
                          <span
                            aria-hidden="true"
                            className="h-3 text-xs leading-3 font-black"
                          >
                            {state === 'yes'
                              ? '✓'
                              : state === 'maybe'
                                ? '?'
                                : ''}
                          </span>
                        )}
                        {unseen && (
                          <span
                            aria-hidden="true"
                            className="absolute -top-1 -right-1 rounded-full bg-brand px-1 text-[0.55rem] font-black text-brand-ink uppercase"
                          >
                            {t('cal.new')}
                          </span>
                        )}
                        {hint && hint.total > 0 && (
                          <span
                            aria-hidden="true"
                            className="absolute right-1.5 bottom-1 left-1.5 flex h-1 overflow-hidden rounded-full bg-black/10"
                          >
                            <span
                              style={{
                                width: `${(hint.yes / hint.total) * 100}%`,
                                background: 'var(--owl-yes)',
                              }}
                            />
                            <span
                              style={{
                                width: `${(hint.maybe / hint.total) * 100}%`,
                                background: 'var(--owl-maybe)',
                              }}
                            />
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
