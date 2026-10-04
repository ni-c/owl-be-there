import {
  formatDay,
  formatDayRange,
  heatLevel,
  heatOf,
  rankBlocks,
  tally,
  type EventSnapshotData,
  type ISODate,
  type RankedBlock,
  type Respondent,
  type Weekday,
} from '@owl/shared';
import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { errorMessage } from '../lib/errors.ts';
import type { EventStore } from '../lib/eventStore.ts';
import { CalendarGrid, type HeatInfo } from './CalendarGrid.tsx';
import { CheckIcon, StarIcon } from './icons.tsx';
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
  const { t, locale } = useI18n();
  const { event } = data;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [openDay, setOpenDay] = useState<ISODate | null>(null);
  const [selected, setSelected] = useState<RankedBlock | null>(null);
  const [error, setError] = useState<string | null>(null);

  const people: Respondent[] = useMemo(
    () =>
      data.participants.map((p) => ({
        id: p.id,
        answered: p.answered,
        yes: new Set(p.yes),
        maybe: new Set(p.maybe),
        unseen: new Set(p.unseen),
      })),
    [data.participants]
  );
  const visible = useMemo(
    () => people.filter((p) => !hidden.has(p.id)),
    [people, hidden]
  );
  const names = useMemo(
    () => new Map(data.participants.map((p) => [p.id, p])),
    [data.participants]
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
  const highlighted = useMemo(() => new Set(best[0]?.days ?? []), [best]);
  const selectedDays = useMemo(() => new Set(selected?.days ?? []), [selected]);
  const answeredCount = visible.filter((p) => p.answered).length;
  const waiting = data.participants.filter((p) => !p.answered);

  if (!data.participants.some((p) => p.answered)) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Owl mood="sleeping" size={110} />
        <p className="text-lg font-extrabold">{t('group.empty.title')}</p>
        <p className="max-w-sm text-muted">{t('group.empty.text')}</p>
        {waiting.length > 0 && (
          <p className="text-sm text-muted">
            {t('group.waiting', {
              names: waiting.map((p) => p.name).join(', '),
            })}
          </p>
        )}
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
                      className="flex min-h-11 flex-1 items-center gap-3 text-left"
                      aria-pressed={isSelected}
                      onClick={() => setSelected(isSelected ? null : block)}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken font-black">
                        {index === 0 ? <StarIcon size={16} /> : index + 1}
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
        {waiting.length > 0 && (
          <p className="text-sm text-muted">
            {t('group.waiting', {
              names: waiting.map((p) => p.name).join(', '),
            })}
          </p>
        )}
      </section>

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
        {openDay && <DayDetails day={openDay} people={visible} names={names} />}
      </Dialog>
    </div>
  );
}

function DayDetails({
  day,
  people,
  names,
}: {
  day: ISODate;
  people: Respondent[];
  names: Map<string, { name: string; note: string | null }>;
}) {
  const { t } = useI18n();
  const dayTally = tally(people, [day]);
  const groups = [
    { key: 'yes' as const, label: t('day.can'), swatch: 'bg-yes' },
    { key: 'maybe' as const, label: t('day.maybe'), swatch: 'bg-maybe hatch' },
    { key: 'no' as const, label: t('day.cannot'), swatch: 'bg-line' },
    {
      key: 'open' as const,
      label: t('day.open'),
      swatch: 'border-2 border-dashed border-line-strong',
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => {
        const ids = dayTally[group.key];
        return (
          <section key={group.key}>
            <h4 className="mb-1.5 flex items-center gap-2 font-extrabold">
              <span
                className={`inline-block size-4 rounded ${group.swatch}`}
                aria-hidden="true"
              />
              {group.label} <span className="text-muted">· {ids.length}</span>
            </h4>
            {ids.length === 0 ? (
              <p className="text-sm text-muted">{t('day.nobody')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {ids.map((id) => {
                  const person = names.get(id);
                  return (
                    <li key={id}>
                      <span className="font-bold">{person?.name}</span>
                      {person?.note && (
                        <span className="text-muted"> — {person.note}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Legend() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1.5">
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
      <p className="text-xs text-muted">{t('group.maybeHalf')}</p>
    </div>
  );
}
