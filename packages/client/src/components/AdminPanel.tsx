import {
  addDays,
  compareISODate,
  diffDays,
  EMOJI_KEYS,
  EMOJIS,
  expandRange,
  isValidISODate,
  LIMITS,
  maxISODate,
  minISODate,
  type EmojiKey,
  type EventSnapshotData,
  type ISODate,
  type Mark,
  type Weekday,
} from '@owl/shared';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { api, ApiFailure } from '../lib/api.ts';
import { errorMessage } from '../lib/errors.ts';
import type { EventStore } from '../lib/eventStore.ts';
import { forgetEvent } from '../lib/prefs.ts';
import { CalendarGrid } from './CalendarGrid.tsx';
import { LockIcon, TrashIcon } from './icons.tsx';
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
    <details className="group rounded-2xl border border-line bg-surface open:bg-surface">
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

export function AdminPanel(props: AdminPanelProps) {
  const { data, store, adminToken } = props;
  const { t } = useI18n();
  const [message, setMessage] = useState<{
    tone: 'error' | 'success';
    text: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { event } = data;

  const run = async (action: () => Promise<EventSnapshotData | void>) => {
    setMessage(null);
    try {
      const result = await action();
      if (result) store.apply(result);
      else void store.refresh();
      setMessage({ tone: 'success', text: t('admin.saved') });
    } catch (failure) {
      if (failure instanceof ApiFailure && failure.code === 'forbidden')
        props.onAdminLost();
      setMessage({ tone: 'error', text: errorMessage(failure, t) });
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-xl font-extrabold">{t('admin.title')}</h2>
      <div className="flex flex-wrap gap-2">
        {event.status === 'open' ? (
          <Button
            onClick={() =>
              run(() =>
                api.setStatus(event.id, { status: 'closed' }, adminToken)
              )
            }
          >
            <LockIcon size={18} /> {t('admin.close')}
          </Button>
        ) : (
          <Button
            onClick={() =>
              run(() => api.setStatus(event.id, { status: 'open' }, adminToken))
            }
          >
            {event.status === 'finalized'
              ? t('admin.unchoose')
              : t('admin.reopen')}
          </Button>
        )}
      </div>
      {event.status !== 'finalized' && (
        <p className="text-sm text-muted">{t('admin.chooseHint')}</p>
      )}

      <Section title={t('admin.edit')}>
        <DetailsForm
          data={data}
          onSave={(body) =>
            run(() => api.updateEvent(event.id, body, adminToken))
          }
        />
      </Section>
      <Section title={t('admin.days')}>
        <DaysEditor
          // Days changed elsewhere start a fresh edit from the new list.
          key={event.days.join()}
          {...props}
          onSave={(days, baseDays) =>
            run(() => api.updateEvent(event.id, { days, baseDays }, adminToken))
          }
        />
      </Section>
      <Section title={t('admin.people')}>
        <People
          {...props}
          run={run}
          onAdd={(names) =>
            run(() => api.addRoster(event.id, names, adminToken))
          }
        />
      </Section>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <div>
        <Button
          variant="ghost"
          className="text-danger"
          onClick={() => setConfirmDelete(true)}
        >
          <TrashIcon size={18} /> {t('admin.delete')}
        </Button>
      </div>
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
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await api.deleteEvent(event.id, adminToken);
                  forgetEvent(event.id);
                  store.markDeleted();
                } catch (failure) {
                  setConfirmDelete(false);
                  setMessage({ tone: 'error', text: errorMessage(failure, t) });
                }
              }}
            >
              {t('admin.deleteYes')}
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

function DetailsForm({
  data,
  onSave,
}: {
  data: EventSnapshotData;
  onSave(body: {
    title: string;
    description: string | null;
    location: string | null;
    creatorName: string | null;
    emoji: EmojiKey;
    minCount: number | null;
    durationDays: number;
  }): Promise<void>;
}) {
  const { t } = useI18n();
  const { event } = data;
  const [title, setTitle] = useState(event.title);
  const [emoji, setEmoji] = useState<EmojiKey>(event.emoji);
  const [description, setDescription] = useState(event.description ?? '');
  const [location, setLocation] = useState(event.location ?? '');
  const [creatorName, setCreatorName] = useState(event.creatorName ?? '');
  const [minCount, setMinCount] = useState(event.minCount?.toString() ?? '');
  const [duration, setDuration] = useState(event.durationDays.toString());

  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (title.trim() === '') return;
    void onSave({
      title,
      emoji,
      description: description.trim() || null,
      location: location.trim() || null,
      creatorName: creatorName.trim() || null,
      minCount: minCount.trim()
        ? Math.min(LIMITS.participants, Math.max(1, Number(minCount)))
        : null,
      durationDays: Math.min(
        LIMITS.durationDays,
        Math.max(1, Number(duration) || 1)
      ),
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label={t('create.titleLabel')}>
        {({ id }) => (
          <TextInput
            id={id}
            value={title}
            maxLength={LIMITS.title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        )}
      </Field>
      <Field label={t('create.emoji')}>
        {({ id }) => (
          <Select
            id={id}
            value={emoji}
            onChange={(e) => setEmoji(e.target.value as EmojiKey)}
            className="min-h-11 rounded-2xl border-2 border-line bg-surface pl-3"
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
            value={description}
            maxLength={LIMITS.description}
            aria-describedby={describedBy}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('create.location')}>
          {({ id }) => (
            <TextInput
              id={id}
              value={location}
              maxLength={LIMITS.location}
              onChange={(e) => setLocation(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('create.creator')}>
          {({ id }) => (
            <TextInput
              id={id}
              value={creatorName}
              maxLength={LIMITS.creatorName}
              onChange={(e) => setCreatorName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('create.minCount')}>
          {({ id }) => (
            <TextInput
              id={id}
              inputMode="numeric"
              value={minCount}
              onChange={(e) => setMinCount(e.target.value.replace(/\D/g, ''))}
            />
          )}
        </Field>
        <Field label={t('create.duration')}>
          {({ id }) => (
            <TextInput
              id={id}
              inputMode="numeric"
              value={duration}
              onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))}
            />
          )}
        </Field>
      </div>
      <div>
        <Button type="submit" variant="primary">
          {t('mine.save')}
        </Button>
      </div>
    </form>
  );
}

function DaysEditor(
  props: AdminPanelProps & {
    onSave(days: ISODate[], baseDays: ISODate[]): Promise<void>;
  }
) {
  const { data, today, firstWeekday } = props;
  const { t } = useI18n();
  const days = data.event.days;
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const [until, setUntil] = useState(last);
  const [selection, setSelection] = useState<Map<ISODate, Mark>>(
    () => new Map(days.map((day) => [day, 'yes' as Mark]))
  );

  // The range to show: the existing days, extended up to the chosen end.
  const end = isValidISODate(until) ? maxISODate(until, last) : last;
  const range = useMemo(
    () =>
      expandRange(
        first,
        diffDays(first, end) + 1 <= LIMITS.span
          ? end
          : addDays(first, LIMITS.span - 1)
      ),
    [first, end]
  );

  const selected = [...selection.keys()].sort();
  return (
    <div className="flex flex-col gap-4">
      <Field label={t('admin.addDays')}>
        {({ id }) => (
          <TextInput
            id={id}
            type="date"
            value={until}
            min={last}
            max={addDays(today, LIMITS.horizon)}
            className="max-w-48"
            onChange={(e) => {
              const value = e.target.value;
              setUntil(value);
              if (!isValidISODate(value) || compareISODate(value, last) <= 0)
                return;
              // Never past what an event may span or how far ahead it may
              // reach — a far date typed in must not throw.
              const limit = minISODate(
                addDays(first, LIMITS.span - 1),
                addDays(today, LIMITS.horizon)
              );
              const upTo = minISODate(value, limit);
              if (compareISODate(upTo, last) <= 0) return;
              const next = new Map(selection);
              for (const day of expandRange(addDays(last, 1), upTo))
                next.set(day, 'yes');
              setSelection(next);
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
        onChange={(next) => setSelection(next)}
        firstWeekday={firstWeekday}
        today={today}
        label={t('admin.days')}
      />
      <div>
        <Button
          variant="primary"
          disabled={selected.length === 0}
          onClick={() => void props.onSave(selected, days)}
        >
          {t('mine.save')}
        </Button>
      </div>
    </div>
  );
}

function People(
  props: AdminPanelProps & {
    run(action: () => Promise<EventSnapshotData | void>): Promise<void>;
    onAdd(names: string[]): Promise<void>;
  }
) {
  const { data, adminToken, run } = props;
  const { t } = useI18n();
  const [names, setNames] = useState('');
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(
    null
  );
  // Removing a password opens the entry to everyone with the event link and
  // ends the person's sessions, so it asks first like removing the person.
  const [unlocking, setUnlocking] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const credentials = { admin: adminToken };
  return (
    <div className="flex flex-col gap-4">
      {data.participants.length === 0 ? (
        <p className="text-muted">{t('admin.noPeople')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {data.participants.map((person) => (
            <li
              key={person.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span className="font-bold">
                {person.name}
                {person.hasPassword && <LockIcon size={14} />}
              </span>
              <span className="flex flex-wrap gap-1">
                <Button size="sm" onClick={() => props.onFillIn(person.id)}>
                  {t('admin.fillIn')}
                </Button>
                {person.hasPassword && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setUnlocking({ id: person.id, name: person.name })
                    }
                  >
                    {t('admin.resetPassword')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  onClick={() =>
                    setRemoving({ id: person.id, name: person.name })
                  }
                >
                  {t('admin.remove')}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const list = names
            .split('\n')
            .map((name) => name.trim())
            .filter(Boolean)
            .slice(0, LIMITS.roster);
          if (list.length === 0) return;
          void props.onAdd(list).then(() => setNames(''));
        }}
      >
        <Field label={t('admin.addNames')} hint={t('admin.addNamesHint')}>
          {({ id, describedBy }) => (
            <TextArea
              id={id}
              value={names}
              rows={3}
              aria-describedby={describedBy}
              onChange={(e) => setNames(e.target.value)}
            />
          )}
        </Field>
        <div>
          <Button type="submit">{t('admin.addNames')}</Button>
        </div>
      </form>
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={t('admin.remove')}
      >
        <div className="flex flex-col gap-4">
          <p>{t('admin.removeConfirm', { name: removing?.name ?? '' })}</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setRemoving(null)}>
              {t('mine.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const target = removing;
                setRemoving(null);
                if (target)
                  void run(() =>
                    api.deleteParticipant(data.event.id, target.id, credentials)
                  );
              }}
            >
              {t('admin.remove')}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={unlocking !== null}
        onClose={() => setUnlocking(null)}
        title={t('admin.resetPassword')}
      >
        <div className="flex flex-col gap-4">
          <p>
            {t('admin.resetPasswordConfirm', { name: unlocking?.name ?? '' })}
          </p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setUnlocking(null)}>
              {t('mine.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const target = unlocking;
                setUnlocking(null);
                if (target)
                  void run(
                    async () =>
                      void (await api.updateParticipant(
                        data.event.id,
                        target.id,
                        { password: null },
                        credentials
                      ))
                  );
              }}
            >
              {t('admin.resetPassword')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
