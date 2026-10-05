import {
  clearDays,
  compareISODate,
  toggleDays,
  type ISODate,
  type Mark,
  type Marks,
  type Weekday,
} from '@owl/shared';
import { useCallback, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { pushUndo, sameMarksOn } from '../lib/undoStack.ts';
import { CalendarGrid, type HintInfo } from './CalendarGrid.tsx';
import { CheckIcon, UndoIcon } from './icons.tsx';
import { Button, Notice, Segmented } from './ui.tsx';

/** Strokes that can be undone, the oldest forgotten first. */
const UNDO_LIMIT = 50;

/**
 * Marking one's own days: the yes/maybe brush, undo, all and none, and the
 * calendar to paint on. Where the marks go is the caller's business — the
 * event page saves them, the example on the start page only shows them.
 */
export function MarksEditor(props: {
  days: readonly ISODate[];
  marks: Marks;
  onMarksChange(next: Marks): void;
  today: ISODate;
  firstWeekday: Weekday;
  label: string;
  locked?: boolean;
  hints?: ReadonlyMap<ISODate, HintInfo>;
  unseen?: ReadonlySet<ISODate>;
}) {
  const { days, marks, onMarksChange, today, locked = false } = props;
  const { t, tn } = useI18n();
  const [brush, setBrush] = useState<Mark>('yes');
  // The strokes that can be undone, and the marks this editor last handed on.
  // Marks that differ from those came from somewhere else — another device's
  // save adopted by the page — and undoing back past them would wipe them out,
  // so the history starts over.
  const [history, setHistory] = useState<{ undo: Marks[]; emitted: Marks }>({
    undo: [],
    emitted: marks,
  });
  const [announcement, setAnnouncement] = useState('');
  const undo = useMemo(
    () => (sameMarksOn(days, marks, history.emitted) ? history.undo : []),
    [days, marks, history]
  );

  const change = useCallback(
    (next: Map<ISODate, Mark>, changed: number) => {
      setHistory((current) => ({
        undo: pushUndo(
          sameMarksOn(days, marks, current.emitted) ? current.undo : [],
          marks,
          UNDO_LIMIT
        ),
        emitted: next,
      }));
      onMarksChange(next);
      setAnnouncement(tn('cal.changed', changed));
    },
    [days, marks, onMarksChange, tn]
  );

  const undoLast = useCallback(() => {
    const previous = undo[undo.length - 1];
    if (!previous) return;
    setHistory({ undo: undo.slice(0, -1), emitted: previous });
    onMarksChange(previous);
  }, [undo, onMarksChange]);

  const future = useMemo(
    () => days.filter((day) => compareISODate(day, today) >= 0),
    [days, today]
  );
  const unseen = props.unseen ?? new Set<ISODate>();

  return (
    <div className="flex flex-col gap-4">
      {locked ? (
        <Notice>{t('mine.closed')}</Notice>
      ) : (
        <>
          {unseen.size > 0 && (
            <Notice tone="success">{tn('mine.newDays', unseen.size)}</Notice>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented<Mark>
              label={t('mine.brush')}
              value={brush}
              onChange={setBrush}
              options={[
                {
                  value: 'yes',
                  label: (
                    <>
                      <span className="grid size-5 place-items-center rounded-md bg-yes text-yes-ink">
                        <CheckIcon size={14} />
                      </span>
                      {t('mine.brushYes')}
                    </>
                  ),
                },
                {
                  value: 'maybe',
                  label: (
                    <>
                      <span className="hatch grid size-5 place-items-center rounded-md bg-maybe text-xs font-black text-maybe-ink">
                        ?
                      </span>
                      {t('mine.brushMaybe')}
                    </>
                  ),
                },
              ]}
            />
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={undoLast}
                disabled={undo.length === 0}
              >
                <UndoIcon size={16} />
                {t('mine.undo')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const result = toggleDays(marks, future, brush);
                  if (result.changed > 0) change(result.marks, result.changed);
                }}
              >
                {t('mine.all')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const result = clearDays(marks, future);
                  if (result.changed > 0) change(result.marks, result.changed);
                }}
              >
                {t('mine.none')}
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted">{t('mine.hint')}</p>
        </>
      )}
      <CalendarGrid
        mode="paint"
        days={days}
        marks={marks}
        brush={brush}
        onChange={change}
        disabled={locked}
        {...(props.hints && { hints: props.hints })}
        unseen={unseen}
        onBrushChange={setBrush}
        onUndo={undoLast}
        firstWeekday={props.firstWeekday}
        today={today}
        label={props.label}
      />
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
