import {
  formatDay,
  formatDayRange,
  heatLevel,
  heatOf,
  rankBlocks,
  respondentOf,
  tally,
  type EventSnapshotData,
  type ISODate,
  type RankedBlock,
  type Respondent,
  type Weekday,
} from '@owl/shared';
import { useId, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { errorMessage } from '../lib/errors.ts';
import type { EventStore } from '../lib/eventStore.ts';
import { liveHidden, liveOpenDay, liveSelection } from '../lib/groupState.ts';
import { CalendarGrid, type HeatInfo } from './CalendarGrid.tsx';
import { CheckIcon, NoteIcon, StarIcon } from './icons.tsx';
import { Owl } from './Owl.tsx';
import { Button, Chip, Dialog, Notice } from './ui.tsx';

interface GroupViewProps {
  data: EventSnapshotData;
  /** Needed only with `adminToken`, to apply a chosen date. */
  store?: EventStore;
  adminToken: string | null;
  firstWeekday: Weekday;
  today: ISODate;
}

const BEST_SHOWN = 5;

export function GroupView(props: GroupViewProps) {
  const { data, adminToken, today, store } = props;
  const { t, locale, number } = useI18n();
  const { event } = data;
  const [hiddenIds, setHidden] = useState<Set<string>>(new Set());
  const [openDayState, setOpenDay] = useState<ISODate | null>(null);
  const [selectedBlock, setSelected] = useState<RankedBlock | null>(null);
  const [error, setError] = useState<string | null>(null);
  const notesHeading = useId();

  const people: Respondent[] = useMemo(
    () => data.participants.map(respondentOf),
    [data.participants]
  );
  const names = useMemo(
    () => new Map(data.participants.map((p) => [p.id, p])),
    [data.participants]
  );
  // What was picked is checked against every new snapshot: a person, a day or
  // a block that is gone is no longer hidden, open or selected.
  const hidden = useMemo(
    () => liveHidden(hiddenIds, names),
    [hiddenIds, names]
  );
  const visible = useMemo(
    () => people.filter((p) => !hidden.has(p.id)),
    [people, hidden]
  );

  const heat = useMemo(() => {
    const map = new Map<ISODate, HeatInfo>();
    for (const day of event.days) {
      const dayTally = tally(visible, [day]);
      map.set(day, {
        level: heatLevel(heatOf(dayTally)),
        yes: dayTally.yes.length,
        maybe: dayTally.maybe.length,
        no: dayTally.no.length,
      });
    }
    return map;
  }, [event.days, visible]);

  const ranked = useMemo(
    () =>
      rankBlocks({
        candidates: event.days,
        people,
        hidden,
        duration: event.durationDays,
        minCount: event.minCount,
        today,
      }).filter(
        (block) => block.tally.yes.length + block.tally.maybe.length > 0
      ),
    [event, people, hidden, today]
  );
  const best = ranked.slice(0, BEST_SHOWN);
  const highlighted = useMemo(() => new Set(ranked[0]?.days ?? []), [ranked]);
  const selected = liveSelection(selectedBlock, best);
  const selectedDays = useMemo(() => new Set(selected?.days ?? []), [selected]);
  const answeredCount = visible.filter((p) => p.answered).length;
  const waiting = data.participants.filter((p) => !p.answered);
  const waitingNote = waiting.length > 0 && (
    <p className="text-sm [overflow-wrap:anywhere] text-muted">
      {t('group.waiting', { names: waiting.map((p) => p.name).join(', ') })}
    </p>
  );
  // Every note, whether its writer is counted or has answered at all.
  const notes = data.participants.filter((p) => p.note);
  const anyAnswered = data.participants.some((p) => p.answered);
  const openDay = liveOpenDay(openDayState, event.days, anyAnswered);
  // A day sheet that closed because its day or every answer went must not
  // open again by itself when the day or an answer comes back.
  if (openDay !== openDayState) setOpenDay(openDay);
  if (selected === null && selectedBlock !== null) setSelected(null);

  if (!anyAnswered) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Owl mood="sleeping" size={110} />
        <p className="text-lg font-extrabold">{t('group.empty.title')}</p>
        <p className="max-w-sm text-muted">{t('group.empty.text')}</p>
        {waitingNote}
      </div>
    );
  }

  const choose = async (block: RankedBlock) => {
    if (!adminToken || !store) return;
    setError(null);
    try {
      store.apply(
        await api.setStatus(
          event.id,
          { status: 'finalized', start: block.start },
          adminToken
        )
      );
    } catch (failure) {
      setError(errorMessage(failure, t));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Legend />
      <CalendarGrid
        mode="heat"
        days={event.days}
        heat={heat}
        highlighted={highlighted}
        selected={selectedDays}
        onDayClick={setOpenDay}
        firstWeekday={props.firstWeekday}
        today={today}
        label={t('event.tabGroup')}
      />

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-extrabold">{t('group.best')}</h3>
        {best.length === 0 ? (
          <p className="text-muted">{t('group.noBlocks')}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {best.map((block, index) => {
              const isChosen = event.finalStart === block.start;
              const isSelected = selected?.start === block.start;
              return (
                <li key={block.start}>
                  <div
                    className={`flex flex-wrap items-center gap-3 rounded-2xl border-2 p-3 ${
                      isSelected
                        ? 'border-focus'
                        : index === 0
                          ? 'border-brand'
                          : 'border-line'
                    }`}
                  >
                    <button
                      type="button"
                      className="flex min-h-11 flex-1 items-center gap-3 text-start"
                      aria-pressed={isSelected}
                      onClick={() => setSelected(isSelected ? null : block)}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken font-black">
                        {index === 0 ? (
                          <StarIcon size={16} />
                        ) : (
                          number(index + 1)
                        )}
                      </span>
                      <span className="flex flex-col">
                        <span className="font-extrabold">
                          {formatDayRange(block.start, block.end, locale)}
                        </span>
                        <span className="text-sm text-muted">
                          {t('group.count', {
                            yes: block.tally.yes.length,
                            total: answeredCount,
                          })}
                          {block.tally.maybe.length > 0 &&
                            ` · ${t('group.maybeCount', { count: block.tally.maybe.length })}`}
                        </span>
                      </span>
                    </button>
                    {event.minCount !== null &&
                      (block.meetsMin ? (
                        <span className="rounded-full bg-yes px-2.5 py-1 text-xs font-black text-yes-ink">
                          {t('group.enough')}
                        </span>
                      ) : block.mayMeetMin ? (
                        <span className="hatch rounded-full bg-maybe px-2.5 py-1 text-xs font-black text-maybe-ink">
                          {t('group.enoughMaybe')}
                        </span>
                      ) : null)}
                    {isChosen ? (
                      <span className="inline-flex items-center gap-1 font-black text-brand">
                        <CheckIcon size={16} /> {t('group.chosen')}
                      </span>
                    ) : (
                      adminToken && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => void choose(block)}
                        >
                          {t('group.choose')}
                        </Button>
                      )
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-extrabold">{t('group.people')}</h3>
        <p className="text-sm text-muted">{t('group.hiddenHint')}</p>
        <div className="flex flex-wrap gap-2">
          {data.participants
            .filter((p) => p.answered)
            .map((p) => (
              <Chip
                key={p.id}
                pressed={!hidden.has(p.id)}
                onClick={() => {
                  const next = new Set(hidden);
                  if (next.has(p.id)) next.delete(p.id);
                  else next.add(p.id);
                  setHidden(next);
                }}
                className={hidden.has(p.id) ? 'line-through' : ''}
              >
                {p.name}
                {p.note && <NoteIcon size={14} />}
              </Chip>
            ))}
          {hidden.size > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setHidden(new Set())}
            >
              {t('group.showAll')}
            </Button>
          )}
        </div>
        {waitingNote}
      </section>

      {notes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 id={notesHeading} className="text-lg font-extrabold">
            {t('day.notes')}
          </h3>
          <ul
            className="flex flex-col gap-1 text-sm text-muted"
            aria-labelledby={notesHeading}
          >
            {notes.map((p) => (
              <li
                key={p.id}
                className="flex items-start gap-1.5 [overflow-wrap:anywhere]"
              >
                <span className="mt-0.5 shrink-0">
                  <NoteIcon size={14} />
                </span>
                <span className="min-w-0">
                  <span className="font-bold">{p.name}:</span> {p.note}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog
        open={openDay !== null}
        onClose={() => setOpenDay(null)}
        title={
          openDay
            ? formatDay(openDay, locale, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })
            : ''
        }
      >
        {openDay && (
          <DayDetails
            day={openDay}
            people={visible}
            everyone={people}
            names={names}
          />
        )}
      </Dialog>
    </div>
  );
}

function DayDetails({
  day,
  people,
  everyone,
  names,
}: {
  day: ISODate;
  /** The people counted; the groups list them. */
  people: Respondent[];
  /** Everyone, counted or not: a note is shown either way. */
  everyone: Respondent[];
  names: Map<string, { name: string; note: string | null }>;
}) {
  const { t, number } = useI18n();
  const dayTally = tally(people, [day]);
  const style = {
    yes: {
      label: t('day.can'),
      swatch: 'bg-yes',
      chip: 'border-yes/50 bg-yes/15',
    },
    maybe: {
      label: t('day.maybe'),
      swatch: 'bg-maybe hatch',
      chip: 'border-maybe/50 bg-maybe/15',
    },
    no: {
      label: t('day.cannot'),
      swatch: 'bg-line',
      chip: 'border-line bg-surface',
    },
    open: {
      label: t('day.open'),
      swatch: 'border-2 border-dashed border-line-strong',
      chip: 'border-dashed border-line-strong',
    },
  };
  const keys = ['yes', 'maybe', 'no', 'open'] as const;
  const answerOf = new Map<string, (typeof keys)[number]>();
  const everyoneTally = tally(everyone, [day]);
  for (const key of keys) {
    for (const id of everyoneTally[key]) answerOf.set(id, key);
  }
  const notes = [...names].filter(([, person]) => person.note);
  const chip = (name: string | undefined, key: (typeof keys)[number]) => (
    <span
      className={`inline-flex max-w-full shrink-0 rounded-full border px-2.5 py-0.5 text-sm font-semibold [overflow-wrap:anywhere] ${style[key].chip}`}
    >
      {name}
    </span>
  );
  return (
    <div className="flex flex-col gap-4">
      {keys.map((key) => {
        const group = style[key];
        const ids = dayTally[key];
        const empty = ids.length === 0;
        return (
          <section key={key}>
            <h4
              className={`flex items-center gap-2 font-extrabold ${
                empty ? 'text-muted' : 'mb-2'
              }`}
            >
              <span
                className={`inline-block size-4 rounded ${group.swatch} ${
                  empty ? 'opacity-50' : ''
                }`}
                aria-hidden="true"
              />
              {group.label}{' '}
              <span className="text-muted">· {number(ids.length)}</span>
            </h4>
            {!empty && (
              <ul className="flex flex-wrap gap-1.5">
                {ids.map((id) => (
                  <li key={id} className="max-w-full">
                    {chip(names.get(id)?.name, key)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {notes.length > 0 && (
        <section className="border-t border-line pt-4">
          <h4 className="mb-2 flex items-center gap-2 font-extrabold">
            <NoteIcon size={16} />
            {t('day.notes')}{' '}
            <span className="text-muted">· {notes.length}</span>
          </h4>
          <ul className="flex flex-col gap-2">
            {notes.map(([id, person]) => {
              const key = answerOf.get(id) ?? 'open';
              return (
                <li key={id} className="flex items-start gap-2">
                  {chip(person.name, key)}
                  <span className="sr-only"> ({style[key].label})</span>
                  <p className="min-w-0 pt-0.5 text-sm text-muted [overflow-wrap:anywhere]">
                    {person.note}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Legend() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 text-sm font-bold">
      <span>{t('group.legendFew')}</span>
      <div
        className="flex flex-1 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={t('group.legend')}
      >
        {[0, 1, 2, 3, 4, 5].map((level) => (
          <span
            key={level}
            className="legend-step"
            style={{ background: `var(--owl-heat-${level})` }}
          />
        ))}
      </div>
      <span>{t('group.legendAll')}</span>
    </div>
  );
}
