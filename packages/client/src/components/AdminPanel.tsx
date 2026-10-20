import {
  addDays,
  EMOJI_KEYS,
  EMOJIS,
  LIMITS,
  maxISODate,
  type EmojiKey,
  type EventSnapshotData,
  type ISODate,
  type Mark,
  type Weekday,
} from '@owl/shared';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useI18n } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import {
  daysProblem,
  daysToSave,
  extendSelection,
  isLossy,
  savingImpact,
  visibleRange,
  type Problem,
  type SavingImpact,
} from '../lib/dayEdit.ts';
import { errorMessage, isForbidden } from '../lib/errors.ts';
import type { EventStore } from '../lib/eventStore.ts';
import {
  changedFields,
  checkDetails,
  detailsOf,
  inputOf,
  parseRoster,
  type DetailsValues,
} from '../lib/forms.ts';
import { forgetEvent } from '../lib/prefs.ts';
import { CalendarGrid } from './CalendarGrid.tsx';
import {
  ChevronEndIcon,
  LockIcon,
  NoteIcon,
  PencilIcon,
  TrashIcon,
} from './icons.tsx';
import {
  Button,
  Card,
  Dialog,
  Field,
  Notice,
  Select,
  TextArea,
  TextInput,
} from './ui.tsx';

interface AdminPanelProps {
  data: EventSnapshotData;
  store: EventStore;
  adminToken: string;
  onAdminLost(): void;
  firstWeekday: Weekday;
  today: ISODate;
  onFillIn(participantId: string): void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-line bg-surface">
      <summary className="flex min-h-12 items-center justify-between rounded-2xl px-4 font-extrabold select-none">
        {title}
        <span aria-hidden="true" className="transition group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
  );
}

/** Where in the panel a message belongs: next to the control that caused it. */
type Place = 'status' | 'details' | 'days' | 'people' | 'delete';

export function AdminPanel(props: AdminPanelProps) {
  const { data, store, adminToken } = props;
  const { t } = useI18n();
  const [message, setMessage] = useState<{
    tone: 'error' | 'success';
    text: string;
    place: Place;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  // A second tap before the first save is answered would carry the old days
  // and be refused as a conflict with the first.
  const running = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { event } = data;

  /** Run one change; true when it went through. */
  const run = async (
    place: Place,
    action: () => Promise<EventSnapshotData | void>,
    // The block length a refusal ("no 3 days in a row") talks about.
    count: number = event.durationDays
  ): Promise<boolean> => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (result) store.apply(result);
      else void store.refresh();
      setMessage({ tone: 'success', text: t('admin.saved'), place });
      return true;
    } catch (failure) {
      // A refused key ends the panel: the page says so and takes it away, so
      // a message here would only flash in the last frame.
      if (isForbidden(failure)) {
        props.onAdminLost();
        return false;
      }
      setMessage({
        tone: 'error',
        text: errorMessage(failure, t, { count }),
        place,
      });
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const clearMessage = () => setMessage(null);
  const noticeAt = (place: Place) =>
    message?.place === place && (
      <div className={place === 'delete' || place === 'status' ? '' : 'mt-4'}>
        <Notice tone={message.tone}>{message.text}</Notice>
      </div>
    );

  const deleteEvent = async () => {
    try {
      await api.deleteEvent(event.id, adminToken);
      forgetEvent(event.id);
      store.markDeleted();
    } catch (failure) {
      setConfirmDelete(false);
      if (isForbidden(failure)) {
        props.onAdminLost();
        return;
      }
      setMessage({
        tone: 'error',
        text: errorMessage(failure, t),
        place: 'delete',
      });
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <h2 ref={headingRef} tabIndex={-1} className="text-xl font-extrabold">
        {t('admin.title')}
      </h2>
      {event.status !== 'finalized' && (
        <p className="text-sm text-muted">{t('admin.chooseHint')}</p>
      )}

      <Section title={t('admin.edit')}>
        <DetailsForm
          data={data}
          busy={busy}
          returnFocus={() => headingRef.current}
          onEdit={clearMessage}
          onSave={(body) =>
            run(
              'details',
              () => api.updateEvent(event.id, body, adminToken),
              body.durationDays ?? event.durationDays
            )
          }
        />
        {noticeAt('details')}
      </Section>
      <Section title={t('admin.days')}>
        <DaysEditor
          // Days changed elsewhere start a fresh edit from the new list.
          key={event.days.join()}
          data={data}
          firstWeekday={props.firstWeekday}
          today={props.today}
          busy={busy}
          returnFocus={() => headingRef.current}
          onEdit={clearMessage}
          onSave={(days, baseDays) =>
            run('days', () =>
              api.updateEvent(event.id, { days, baseDays }, adminToken)
            )
          }
        />
        {noticeAt('days')}
      </Section>
      <Section title={t('admin.people')}>
        <People
          data={data}
          adminToken={adminToken}
          onFillIn={props.onFillIn}
          busy={busy}
          onEdit={clearMessage}
          run={(action) => run('people', action)}
        />
        {noticeAt('people')}
      </Section>

      <div className="flex flex-wrap gap-2">
        {event.status === 'open' ? (
          <Button
            disabled={busy}
            onClick={() =>
              void run('status', () =>
                api.setStatus(event.id, { status: 'closed' }, adminToken)
              )
            }
          >
            <LockIcon size={18} /> {t('admin.close')}
          </Button>
        ) : (
          <Button
            disabled={busy}
            onClick={() =>
              void run('status', () =>
                api.setStatus(event.id, { status: 'open' }, adminToken)
              )
            }
          >
            {event.status === 'finalized'
              ? t('admin.unchoose')
              : t('admin.reopen')}
          </Button>
        )}
        <Button variant="dangerOutline" onClick={() => setConfirmDelete(true)}>
          <TrashIcon size={18} /> {t('admin.delete')}
        </Button>
      </div>
      {noticeAt('status')}
      {noticeAt('delete')}
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('admin.delete')}
      >
        <div className="flex flex-col gap-4">
          <p>{t('admin.deleteConfirm')}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => setConfirmDelete(false)}>
              {t('mine.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void deleteEvent()}>
              {t('admin.deleteYes')}
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

/** Asks before a save takes answers or the chosen date away. */
function LossDialog({
  impact,
  returnFocus,
  onCancel,
  onConfirm,
}: {
  impact: SavingImpact | null;
  returnFocus(): HTMLElement | null;
  onCancel(): void;
  onConfirm(): void;
}) {
  const { t, tn } = useI18n();
  return (
    <Dialog
      open={impact !== null}
      onClose={onCancel}
      title={t('admin.lossTitle')}
      returnFocus={returnFocus}
    >
      <div className="flex flex-col gap-4">
        {impact && impact.marks > 0 && (
          <p>{tn('admin.lossMarks', impact.marks)}</p>
        )}
        {impact?.date === 'shortened' && <p>{t('admin.lossDateShort')}</p>}
        {impact?.date === 'dropped' && <p>{t('admin.lossDateDropped')}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onCancel}>{t('mine.cancel')}</Button>
          <Button variant="danger" onClick={onConfirm}>
            {t('admin.lossConfirm')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function DetailsForm({
  data,
  busy,
  returnFocus,
  onEdit,
  onSave,
}: {
  data: EventSnapshotData;
  busy: boolean;
  returnFocus(): HTMLElement | null;
  onEdit(): void;
  onSave(body: Partial<DetailsValues>): Promise<boolean>;
}) {
  const { t } = useI18n();
  const { event } = data;
  // What the form started from: only what differs from it is sent, so a field
  // somebody changed elsewhere meanwhile is not put back by an unrelated edit.
  const [seed, setSeed] = useState(() => detailsOf(event));
  const [input, setInput] = useState(() => inputOf(seed));
  const [tried, setTried] = useState(false);
  const [confirming, setConfirming] = useState<{
    patch: Partial<DetailsValues>;
    values: DetailsValues;
    impact: SavingImpact;
  } | null>(null);
  const edit = (change: Partial<typeof input>) => {
    setInput({ ...input, ...change });
    onEdit();
  };

  const check = checkDetails(input, event.days);
  const errors = tried && !check.ok ? check.errors : {};
  const text = (problem: Problem | undefined) =>
    problem ? t(problem.key, problem.params) : null;

  const save = async (patch: Partial<DetailsValues>, values: DetailsValues) => {
    if (await onSave(patch)) setSeed(values);
  };

  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    setTried(true);
    if (!check.ok) return;
    const patch = changedFields(seed, check.values);
    if (Object.keys(patch).length === 0) return;
    // A different duration can shorten the chosen date or make it not fit.
    const impact =
      patch.durationDays === undefined
        ? null
        : savingImpact(event, data.participants, {
            days: event.days,
            durationDays: patch.durationDays,
          });
    if (impact && isLossy(impact))
      setConfirming({ patch, values: check.values, impact });
    else void save(patch, check.values);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label={t('create.titleLabel')} error={text(errors.title)}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            value={input.title}
            maxLength={LIMITS.title}
            onChange={(e) => edit({ title: e.target.value })}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            required
          />
        )}
      </Field>
      <Field label={t('create.emoji')}>
        {({ id }) => (
          <Select
            id={id}
            value={input.emoji}
            onChange={(e) => edit({ emoji: e.target.value as EmojiKey })}
            className="min-h-11 rounded-2xl border-2 border-line bg-surface ps-3"
          >
            {EMOJI_KEYS.map((key) => (
              <option key={key} value={key}>
                {EMOJIS[key]} {t(`emoji.${key}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('create.description')} hint={t('create.descriptionHint')}>
        {({ id, describedBy }) => (
          <TextArea
            id={id}
            value={input.description}
            maxLength={LIMITS.description}
            aria-describedby={describedBy}
            onChange={(e) => edit({ description: e.target.value })}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('create.location')}>
          {({ id }) => (
            <TextInput
              id={id}
              value={input.location}
              maxLength={LIMITS.location}
              onChange={(e) => edit({ location: e.target.value })}
            />
          )}
        </Field>
        <Field label={t('create.creator')}>
          {({ id }) => (
            <TextInput
              id={id}
              value={input.creatorName}
              maxLength={LIMITS.creatorName}
              onChange={(e) => edit({ creatorName: e.target.value })}
            />
          )}
        </Field>
        <Field label={t('create.minCount')} error={text(errors.minCount)}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              inputMode="numeric"
              value={input.minCount}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) =>
                edit({ minCount: e.target.value.replace(/\D/g, '') })
              }
            />
          )}
        </Field>
        <Field label={t('create.duration')} error={text(errors.duration)}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              inputMode="numeric"
              value={input.duration}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) =>
                edit({ duration: e.target.value.replace(/\D/g, '') })
              }
            />
          )}
        </Field>
      </div>
      <div>
        <Button type="submit" variant="primary" disabled={busy}>
          {t('mine.save')}
        </Button>
      </div>
      <LossDialog
        impact={confirming?.impact ?? null}
        returnFocus={returnFocus}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const pending = confirming;
          setConfirming(null);
          if (pending) void save(pending.patch, pending.values);
        }}
      />
    </form>
  );
}

function DaysEditor(
  props: Pick<AdminPanelProps, 'data' | 'firstWeekday' | 'today'> & {
    busy: boolean;
    returnFocus(): HTMLElement | null;
    onEdit(): void;
    onSave(days: ISODate[], baseDays: ISODate[]): Promise<boolean>;
  }
) {
  const { data, today, firstWeekday, busy } = props;
  const { t } = useI18n();
  const { event } = data;
  const days = event.days;
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const [until, setUntil] = useState(last);
  const [selection, setSelection] = useState<ReadonlyMap<ISODate, Mark>>(
    () => new Map(days.map((day) => [day, 'yes' as Mark]))
  );
  const [confirming, setConfirming] = useState<{
    days: ISODate[];
    impact: SavingImpact;
  } | null>(null);

  // The range to show: the existing days, extended up to the chosen end.
  const range = useMemo(
    () => visibleRange(first, last, until),
    [first, last, until]
  );
  // What is saved is what the calendar shows and has selected.
  const selected = daysToSave(range, selection);
  const problem = daysProblem(selected, event.durationDays);
  const edit = (next: ReadonlyMap<ISODate, Mark>) => {
    setSelection(next);
    props.onEdit();
  };

  const save = (list: ISODate[]) => void props.onSave(list, days);
  const submit = () => {
    const impact = savingImpact(event, data.participants, {
      days: selected,
      durationDays: event.durationDays,
    });
    if (isLossy(impact)) setConfirming({ days: selected, impact });
    else save(selected);
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label={t('admin.addDays')}>
        {({ id }) => (
          <TextInput
            id={id}
            type="date"
            value={until}
            min={maxISODate(last, today)}
            max={addDays(today, LIMITS.horizon)}
            className="max-w-48"
            onChange={(e) => {
              const value = e.target.value;
              setUntil(value);
              edit(
                extendSelection(selection, {
                  first,
                  last,
                  until: value,
                  today,
                  shownEnd: range[range.length - 1]!,
                })
              );
            }}
          />
        )}
      </Field>
      <p className="text-sm text-muted">{t('create.fineTune')}</p>
      <CalendarGrid
        mode="candidates"
        days={range}
        marks={selection}
        brush="yes"
        onChange={(next) => edit(next)}
        firstWeekday={firstWeekday}
        today={today}
        label={t('admin.days')}
      />
      {problem && (
        <p className="text-sm font-semibold text-danger" role="alert">
          {t(problem.key, problem.params)}
        </p>
      )}
      <div>
        <Button
          variant="primary"
          disabled={busy || problem !== null}
          onClick={submit}
        >
          {t('mine.save')}
        </Button>
      </div>
      <LossDialog
        impact={confirming?.impact ?? null}
        returnFocus={props.returnFocus}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const pending = confirming;
          setConfirming(null);
          if (pending) save(pending.days);
        }}
      />
    </div>
  );
}

function People(
  props: Pick<AdminPanelProps, 'data' | 'adminToken' | 'onFillIn'> & {
    busy: boolean;
    onEdit(): void;
    run(action: () => Promise<EventSnapshotData | void>): Promise<boolean>;
  }
) {
  const { data, adminToken, run, busy } = props;
  const { t } = useI18n();
  const [names, setNames] = useState('');
  const [rosterProblem, setRosterProblem] = useState<Problem | null>(null);
  const [sheet, setSheet] = useState<{ id: string; step: SheetStep } | null>(
    null
  );
  // Someone removed elsewhere takes their sheet with them.
  const sheetPerson =
    (sheet && data.participants.find((p) => p.id === sheet.id)) ?? null;
  const credentials = { admin: adminToken };
  return (
    <div className="flex flex-col gap-4">
      {data.participants.length === 0 ? (
        <p className="text-muted">{t('admin.noPeople')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {data.participants.map((person) => (
            <li key={person.id} className="py-1">
              <button
                type="button"
                aria-haspopup="dialog"
                className="-mx-2 flex min-h-12 w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-1.5 text-start hover:bg-sunken"
                onClick={() => setSheet({ id: person.id, step: 'actions' })}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5 font-bold">
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {person.name}
                    </span>
                    {person.hasPassword && (
                      <span className="shrink-0">
                        <LockIcon size={14} />
                      </span>
                    )}
                    {person.note && (
                      <span className="shrink-0">
                        <NoteIcon size={14} />
                      </span>
                    )}
                  </span>
                  {!person.answered && (
                    <span className="text-sm text-muted">{t('day.open')}</span>
                  )}
                </span>
                <span className="shrink-0 text-muted rtl:-scale-x-100">
                  <ChevronEndIcon size={18} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const { names: list, problem } = parseRoster(names);
          setRosterProblem(problem);
          if (problem || list.length === 0) return;
          // What was typed stays when the add fails, so it can be corrected.
          void run(() => api.addRoster(data.event.id, list, adminToken)).then(
            (ok) => {
              if (ok) setNames('');
            }
          );
        }}
      >
        <Field
          label={t('admin.addNames')}
          hint={t('admin.addNamesHint')}
          error={rosterProblem && t(rosterProblem.key, rosterProblem.params)}
        >
          {({ id, describedBy, invalid }) => (
            <TextArea
              id={id}
              value={names}
              rows={3}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => {
                setNames(e.target.value);
                setRosterProblem(null);
                props.onEdit();
              }}
            />
          )}
        </Field>
        <div>
          <Button type="submit" disabled={busy}>
            {t('admin.addNames')}
          </Button>
        </div>
      </form>
      <PersonSheet
        person={sheetPerson}
        step={sheet?.step ?? 'actions'}
        busy={busy}
        onStep={(step) =>
          setSheet((current) => current && { ...current, step })
        }
        onClose={() => setSheet(null)}
        onFillIn={(id) => {
          setSheet(null);
          props.onFillIn(id);
        }}
        onRemove={(id) => {
          setSheet(null);
          void run(() => api.deleteParticipant(data.event.id, id, credentials));
        }}
        onUnlock={(id) => {
          setSheet(null);
          void run(
            async () =>
              void (await api.updateParticipant(
                data.event.id,
                id,
                { password: null },
                credentials
              ))
          );
        }}
      />
    </div>
  );
}

type SheetStep = 'actions' | 'remove' | 'unlock';

/**
 * What the organiser can do about one person, behind their row: buttons as
 * wide as the sheet, so no label in any language has to share a line with a
 * name. Removing the person, or their password (which opens the entry to
 * everyone with the link and ends their sessions), asks first on a second step.
 */
function PersonSheet(props: {
  person: EventSnapshotData['participants'][number] | null;
  step: SheetStep;
  busy: boolean;
  onStep(step: SheetStep): void;
  onClose(): void;
  onFillIn(id: string): void;
  onRemove(id: string): void;
  onUnlock(id: string): void;
}) {
  const { person, step, busy } = props;
  const { t } = useI18n();
  const open = person !== null;
  const ids = { cancel: useId(), remove: useId(), unlock: useId() };
  // The step left last: back on the actions, its button gets the focus again.
  const left = useRef<SheetStep>('actions');
  useEffect(() => {
    if (!open) {
      left.current = 'actions';
      return;
    }
    if (step !== 'actions') document.getElementById(ids.cancel)?.focus();
    else if (left.current !== 'actions')
      document.getElementById(ids[left.current])?.focus();
    left.current = step;
    // The ids are stable for the component's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);
  return (
    <Dialog open={open} onClose={props.onClose} title={person?.name ?? ''}>
      {person &&
        (step === 'actions' ? (
          <div className="flex flex-col gap-3">
            {person.note && (
              <p className="flex items-start gap-2 text-sm text-muted [overflow-wrap:anywhere]">
                <span className="mt-0.5 shrink-0">
                  <NoteIcon size={14} />
                </span>
                {person.note}
              </p>
            )}
            <Button
              variant="primary"
              className="w-full"
              disabled={busy}
              onClick={() => props.onFillIn(person.id)}
            >
              <PencilIcon size={18} /> {t('admin.fillIn')}
            </Button>
            {person.hasPassword && (
              <Button
                id={ids.unlock}
                className="w-full"
                disabled={busy}
                onClick={() => props.onStep('unlock')}
              >
                <LockIcon size={18} /> {t('admin.resetPassword')}
              </Button>
            )}
            <Button
              id={ids.remove}
              variant="dangerOutline"
              className="w-full"
              disabled={busy}
              onClick={() => props.onStep('remove')}
            >
              <TrashIcon size={18} /> {t('admin.remove')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p>
              {t(
                step === 'remove'
                  ? 'admin.removeConfirm'
                  : 'admin.resetPasswordConfirm',
                { name: person.name }
              )}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button id={ids.cancel} onClick={() => props.onStep('actions')}>
                {t('mine.cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() =>
                  step === 'remove'
                    ? props.onRemove(person.id)
                    : props.onUnlock(person.id)
                }
              >
                {t(step === 'remove' ? 'admin.remove' : 'admin.resetPassword')}
              </Button>
            </div>
          </div>
        ))}
    </Dialog>
  );
}
