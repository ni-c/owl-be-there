import {
  charCount,
  cleanLine,
  joinMarks,
  onCandidates,
  othersOnDays,
  LIMITS,
  sameMarks,
  type EventSnapshotData,
  type ISODate,
  type Marks,
  type ParticipantViewData,
  type Weekday,
} from '@owl/shared';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useI18n } from '../i18n/index.tsx';
import { api, ApiFailure, type Credentials } from '../lib/api.ts';
import { errorMessage, sessionRevoked } from '../lib/errors.ts';
import type { EventStore } from '../lib/eventStore.ts';
import { marksSender } from '../lib/marksSender.ts';
import { noteChange } from '../lib/note.ts';
import type { Session } from '../lib/prefs.ts';
import { SaveQueue, type SaveStatus } from '../lib/saveQueue.ts';
import { CheckIcon, LockIcon } from './icons.tsx';
import { MarksEditor } from './MarksEditor.tsx';
import { Button, Chip, Field, Notice, TextInput } from './ui.tsx';

interface MyDaysProps {
  data: EventSnapshotData;
  store: EventStore;
  adminToken: string | null;
  firstWeekday: Weekday;
  today: ISODate;
  session: Session | null;
  onSession(session: Session | null): void;
  /** The organiser filling in for someone. */
  editingFor: string | null;
  onStopEditing(): void;
}

export function MyDays(props: MyDaysProps) {
  const { data, session, editingFor, adminToken } = props;
  const { t } = useI18n();
  const actorId = editingFor ?? session?.participantId ?? null;
  const participant = data.participants.find((p) => p.id === actorId) ?? null;

  // A session whose participant is gone — deleted by the organiser — is over.
  // "Gone" means seen before and missing now: right after joining, the
  // snapshot does not know the new participant yet, and that is not a reason
  // to forget who they are.
  // A session that came from storage was known before this visit, so a
  // participant missing from the first snapshot really is gone.
  const seen = useRef(
    new Set<string>(session && !editingFor ? [session.participantId] : [])
  );
  if (participant) seen.current.add(participant.id);
  const { store, onSession, onStopEditing } = props;
  useEffect(() => {
    if (editingFor) {
      // The person the organiser is filling in for is gone: nothing is left
      // to edit, and the banner with its way back is gone with them.
      if (!data.participants.some((p) => p.id === editingFor)) onStopEditing();
      return;
    }
    if (!session) return;
    const present = data.participants.some(
      (p) => p.id === session.participantId
    );
    if (present) return;
    if (seen.current.has(session.participantId)) {
      onSession(null);
    } else {
      void store.refresh();
    }
  }, [data, session, editingFor, store, onSession, onStopEditing]);

  if (!participant) {
    if (session && !editingFor && !seen.current.has(session.participantId)) {
      return <p className="text-muted">{t('event.loading')}</p>;
    }
    return <WhoAreYou data={data} onSession={props.onSession} />;
  }
  const credentials: Credentials = editingFor
    ? { admin: adminToken }
    : { participant: session?.token };
  return (
    <div className="flex flex-col gap-4">
      {editingFor ? (
        <Notice>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold">
              {t('mine.editingFor', { name: participant.name })}
            </span>
            <Button size="sm" onClick={props.onStopEditing}>
              {t('mine.stopEditing')}
            </Button>
          </div>
        </Notice>
      ) : (
        <Greeting
          data={data}
          participant={participant}
          session={session!}
          onSession={props.onSession}
          store={props.store}
        />
      )}
      <Painter
        key={participant.id}
        {...props}
        participant={participant}
        credentials={credentials}
      />
    </div>
  );
}

/* ------------------------------------------------------------- identity */

function WhoAreYou({
  data,
  onSession,
}: {
  data: EventSnapshotData;
  onSession(session: Session): void;
}) {
  const { t } = useI18n();
  const roster = data.participants.filter((p) => p.source === 'roster');
  const [mode, setMode] = useState<'pick' | 'type'>(
    roster.length > 0 ? 'pick' : 'type'
  );
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [wantPassword, setWantPassword] = useState(false);
  const [needPassword, setNeedPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const closed = data.event.status !== 'open';
  const formId = useId();

  const join = async (who: string, secret?: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.session(data.event.id, who, secret);
      const session = {
        participantId: result.participantId,
        token: result.token,
      };
      onSession(session);
    } catch (failure) {
      if (
        failure instanceof ApiFailure &&
        failure.code === 'password_required'
      ) {
        setNeedPassword(who);
        setName(who);
        setMode('type');
        setError(t('who.protected', { name: who.trim() }));
      } else if (
        failure instanceof ApiFailure &&
        failure.code === 'password_too_short'
      ) {
        setError(t('who.passwordTooShort', { min: LIMITS.passwordMin }));
      } else {
        setError(errorMessage(failure, t));
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return;
    if ((wantPassword || needPassword) && password === '') return;
    void join(name, wantPassword || needPassword ? password : undefined);
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xl font-extrabold">{t('who.title')}</h3>
      {mode === 'pick' && (
        <div className="flex flex-col gap-3">
          <p className="text-muted">{t('who.pick')}</p>
          <div className="flex flex-wrap gap-2">
            {roster.map((person) => (
              <Chip
                key={person.id}
                disabled={busy}
                onClick={() => {
                  if (person.hasPassword) {
                    setName(person.name);
                    setNeedPassword(person.name);
                    setMode('type');
                  } else {
                    void join(person.name);
                  }
                }}
              >
                {person.hasPassword && <LockIcon size={16} />}
                {person.name}
                {person.answered && <CheckIcon size={16} />}
              </Chip>
            ))}
            {!closed && (
              <Chip onClick={() => setMode('type')}>
                {t('who.someoneElse')}
              </Chip>
            )}
          </div>
        </div>
      )}
      {mode === 'type' && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label={t('who.name')}>
            {({ id }) => (
              <TextInput
                id={id}
                value={name}
                maxLength={LIMITS.name}
                autoComplete="nickname"
                onChange={(event) => {
                  setName(event.target.value);
                  setNeedPassword(null);
                }}
                required
              />
            )}
          </Field>
          {!needPassword && !closed && (
            <div className="flex items-start gap-3">
              <input
                id={`${formId}-protect`}
                type="checkbox"
                className="mt-1 size-5 accent-[var(--owl-brand)]"
                checked={wantPassword}
                aria-describedby={`${formId}-protect-hint`}
                onChange={(event) => setWantPassword(event.target.checked)}
              />
              <div>
                <label htmlFor={`${formId}-protect`} className="font-bold">
                  {t('who.addPassword')}
                </label>
                <p id={`${formId}-protect-hint`} className="text-sm text-muted">
                  {t('who.passwordHint')}
                </p>
              </div>
            </div>
          )}
          {(wantPassword || needPassword) && (
            <Field label={t('who.password')}>
              {({ id }) => (
                <TextInput
                  id={id}
                  type="password"
                  value={password}
                  minLength={needPassword ? undefined : LIMITS.passwordMin}
                  maxLength={LIMITS.passwordMax}
                  autoComplete={
                    needPassword ? 'current-password' : 'new-password'
                  }
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              )}
            </Field>
          )}
          <div>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || name.trim() === ''}
            >
              {t('who.continue')}
            </Button>
          </div>
        </form>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

function Greeting({
  data,
  participant,
  session,
  onSession,
  store,
}: {
  data: EventSnapshotData;
  participant: ParticipantViewData;
  session: Session;
  onSession(session: Session | null): void;
  store: EventStore;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(participant.name);
  const [password, setPassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<{
    tone: 'error' | 'success';
    text: string;
  } | null>(null);
  const credentials = { participant: session.token };
  const locked = data.event.status !== 'open';

  const update = async (body: { name?: string; password?: string | null }) => {
    setMessage(null);
    try {
      const result = await api.updateParticipant(
        data.event.id,
        participant.id,
        body,
        credentials
      );
      const next = {
        ...session,
        ...(result.token && { token: result.token }),
      };
      onSession(next);
      setPassword('');
      setMessage({ tone: 'success', text: t('admin.saved') });
      void store.refresh();
    } catch (failure) {
      setMessage({ tone: 'error', text: errorMessage(failure, t) });
    }
  };

  const deleteEntry = async () => {
    try {
      await api.deleteParticipant(data.event.id, participant.id, credentials);
      onSession(null);
      void store.refresh();
    } catch (failure) {
      setMessage({
        tone: 'error',
        text: errorMessage(failure, t),
      });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-lg font-extrabold">
          {t('mine.hello', { name: participant.name })}
        </p>
        <div className="flex gap-1">
          {!locked && (
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {t('mine.entry')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onSession(null)}>
            {t('mine.notYou')}
          </Button>
        </div>
      </div>
      {open && !locked && (
        <div className="flex flex-col gap-4 rounded-2xl bg-sunken p-4">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const cleaned = cleanLine(name);
              if (cleaned && cleaned !== participant.name)
                void update({ name: cleaned });
            }}
          >
            <div className="min-w-48 flex-1">
              <Field label={t('mine.rename')}>
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={name}
                    maxLength={LIMITS.name}
                    onChange={(e) => setName(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <Button type="submit">{t('mine.save')}</Button>
          </form>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (charCount(password) >= LIMITS.passwordMin)
                void update({ password });
              else
                setMessage({
                  tone: 'error',
                  text: t('who.passwordTooShort', { min: LIMITS.passwordMin }),
                });
            }}
          >
            <div className="min-w-48 flex-1">
              <Field
                label={
                  participant.hasPassword
                    ? t('mine.newPassword')
                    : t('mine.setPassword')
                }
              >
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    maxLength={LIMITS.passwordMax}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <Button type="submit">{t('mine.save')}</Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {participant.hasPassword && (
              <Button onClick={() => void update({ password: null })}>
                {t('mine.removePassword')}
              </Button>
            )}
            {confirmDelete ? (
              <>
                <span className="self-center font-bold">
                  {t('mine.deleteConfirm')}
                </span>
                <Button variant="danger" onClick={() => void deleteEntry()}>
                  {t('mine.deleteEntry')}
                </Button>
                <Button onClick={() => setConfirmDelete(false)}>
                  {t('mine.cancel')}
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                {t('mine.deleteEntry')}
              </Button>
            )}
          </div>
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- painting */

function Painter(
  props: MyDaysProps & {
    participant: ParticipantViewData;
    credentials: Credentials;
  }
) {
  const { data, participant, credentials, today, store } = props;
  const { t } = useI18n();
  const eventId = data.event.id;
  const locked = data.event.status !== 'open' && !props.editingFor;
  const [marks, setMarks] = useState<Marks>(() =>
    joinMarks(participant.yes, participant.maybe)
  );
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<unknown>(null);
  const [note, setNote] = useState(participant.note ?? '');
  const [noteFailed, setNoteFailed] = useState(false);
  const noteFocused = useRef(false);
  // The note as the server holds it, to tell a change from a mere blur.
  const savedNote = useRef(participant.note);
  const credentialsRef = useRef(credentials);
  credentialsRef.current = credentials;
  const onSessionRef = useRef(props.onSession);
  onSessionRef.current = props.onSession;

  // The organiser may remove days after marks were made; the queue sends only
  // the days that are candidates when a request goes out.
  const candidates = useMemo(() => new Set(data.event.days), [data.event.days]);
  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;

  const queue = useMemo(
    () =>
      new SaveQueue({
        baseRev: participant.rev,
        send: marksSender({
          put: async (request, keepalive) => {
            const result = await api.putMarks(
              eventId,
              participant.id,
              request,
              credentialsRef.current,
              keepalive
            );
            return result.ok ? { ok: true, rev: result.rev } : result;
          },
          candidates: () => candidatesRef.current,
          refresh: () => void store.refresh(),
        }),
        onStatus: (next, error) => {
          setStatus(next);
          setSaveError(next === 'failed' ? error : null);
          // The token was revoked, say by a new password set elsewhere:
          // nothing can be saved with it any more, so ask who this is again.
          if (
            next === 'failed' &&
            sessionRevoked(error, credentialsRef.current)
          ) {
            onSessionRef.current(null);
          }
        },
        onSaved: () => void store.refresh(),
      }),
    // One queue per participant; the credentials are read through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventId, participant.id]
  );

  // Wires the page's leaving to the queue; unmounting the panel sends what is
  // still unsent before the queue is disposed of.
  useEffect(() => queue.attach(), [queue]);

  // Another device saved: take its marks, unless we have unsaved changes.
  useEffect(() => {
    if (!queue.busy && participant.rev > queue.baseRev) {
      queue.baseRev = participant.rev;
      const server = joinMarks(participant.yes, participant.maybe);
      setMarks((current) => (sameMarks(current, server) ? current : server));
    }
  }, [participant, queue]);

  const save = useCallback(
    (next: Marks) => {
      const kept = onCandidates(next, candidates);
      setMarks(kept);
      queue.push(kept);
    },
    [candidates, queue]
  );

  // How many of the others can on each day: the gentle nudge towards agreement.
  const hints = useMemo(
    () => othersOnDays(data.event.days, data.participants, participant.id),
    [data, participant.id]
  );

  const unseen = useMemo(
    () => new Set(participant.unseen),
    [participant.unseen]
  );
  const statusText: Record<SaveStatus, string> = {
    idle: '',
    saving: t('mine.saving'),
    saved: t('mine.saved'),
    retrying: t('mine.retrying'),
    failed: errorMessage(saveError, t),
  };

  // The note changed elsewhere — another device, the organiser: show it, unless
  // it is being typed in, and compare against it from now on.
  useEffect(() => {
    savedNote.current = participant.note;
    if (!noteFocused.current) setNote(participant.note ?? '');
  }, [participant.note]);

  const saveNote = async () => {
    const change = noteChange(note, savedNote.current);
    setNote(change.cleaned);
    if (!change.send) return;
    try {
      await api.updateParticipant(
        eventId,
        participant.id,
        { note: change.value },
        credentials
      );
      savedNote.current = change.value;
      setNoteFailed(false);
      void store.refresh();
    } catch {
      setNoteFailed(true);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <MarksEditor
        days={data.event.days}
        marks={marks}
        onMarksChange={save}
        locked={locked}
        hints={hints}
        unseen={unseen}
        firstWeekday={props.firstWeekday}
        today={today}
        label={t('event.tabMine')}
      />
      <div className="flex min-h-6 items-center justify-between gap-3 text-sm">
        <span
          role="status"
          aria-live="polite"
          className={`inline-flex items-center gap-1 font-bold ${status === 'failed' ? 'text-danger' : 'text-muted'}`}
        >
          {status === 'saved' && <CheckIcon size={14} />} {statusText[status]}
        </span>
      </div>
      {!locked && marks.size === 0 && !participant.answered && (
        <div>
          <Button onClick={() => queue.push(new Map())}>
            {t('mine.noneWork')}
          </Button>
        </div>
      )}
      {!locked &&
        marks.size === 0 &&
        participant.answered &&
        (status === 'idle' || status === 'saved') && (
          <p className="text-sm text-muted">{t('mine.noneSaved')}</p>
        )}
      {!locked && (
        <Field
          label={t('mine.note')}
          error={noteFailed ? t('mine.failed') : null}
        >
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={note}
              maxLength={LIMITS.note}
              placeholder={t('mine.notePlaceholder')}
              onChange={(event) => {
                setNote(event.target.value);
                setNoteFailed(false);
              }}
              onFocus={() => {
                noteFocused.current = true;
              }}
              onBlur={() => {
                noteFocused.current = false;
                void saveNote();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter')
                  (event.target as HTMLInputElement).blur();
              }}
            />
          )}
        </Field>
      )}
    </div>
  );
}
