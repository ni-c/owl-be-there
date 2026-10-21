import {
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
  type RefObject,
  type ReactNode,
} from 'react';
import { useI18n } from '../i18n/index.tsx';
import { api, ApiFailure, type Credentials } from '../lib/api.ts';
import { isolate } from '../lib/bidi.ts';
import { errorMessage, sessionRevoked } from '../lib/errors.ts';
import type { EventStore } from '../lib/eventStore.ts';
import { marksSender } from '../lib/marksSender.ts';
import { isImeKey, noteChange, passwordLongEnough } from '../lib/note.ts';
import type { Session } from '../lib/prefs.ts';
import { SaveQueue, type SaveStatus } from '../lib/saveQueue.ts';
import {
  closedFailure,
  saveMessageKey,
  shownStatus,
  type NoteStatus,
} from '../lib/saveStatus.ts';
import { CheckIcon, LockIcon, TrashIcon } from './icons.tsx';
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
  // Where focus goes once the next screen is up: the form or the greeting
  // that replaces the one the user just used. Null on the first render.
  const focusNext = useRef<'greeting' | 'who' | null>(null);
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

  const moveFocus = (to: 'greeting' | 'who', next: Session | null) => {
    if (to === 'greeting' || next === null) focusNext.current = to;
    props.onSession(next);
  };
  if (!participant) {
    if (session && !editingFor && !seen.current.has(session.participantId)) {
      return <p className="text-muted">{t('event.loading')}</p>;
    }
    return (
      <WhoAreYou
        data={data}
        focusNext={focusNext}
        onSession={(next) => moveFocus('greeting', next)}
      />
    );
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
              {t('mine.editingFor', { name: isolate(participant.name) })}
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
          focusNext={focusNext}
          onSession={(next) => moveFocus('who', next)}
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
  focusNext,
  onSession,
}: {
  data: EventSnapshotData;
  focusNext: RefObject<'greeting' | 'who' | null>;
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
  const [error, setError] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);
  const closed = data.event.status !== 'open';
  const formId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusNext.current !== 'who') return;
    focusNext.current = null;
    titleRef.current?.focus();
  }, [focusNext]);

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
        setError(t('who.protected', { name: isolate(who.trim()) }));
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
    if (wantPassword && !needPassword && !passwordLongEnough(password)) {
      setError(t('who.passwordTooShort', { min: LIMITS.passwordMin }));
      return;
    }
    void join(name, wantPassword || needPassword ? password : undefined);
  };

  return (
    <div className="flex flex-col gap-4">
      <h3
        ref={titleRef}
        tabIndex={-1}
        className="text-xl font-extrabold outline-none"
      >
        {t('who.title')}
      </h3>
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
                <bdi>{person.name}</bdi>
                {person.answered && <CheckIcon size={16} />}
                {(person.hasPassword || person.answered) && (
                  <span className="sr-only">
                    {person.hasPassword && t('who.hasPassword')}{' '}
                    {person.answered && t('who.answered')}
                  </span>
                )}
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
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label={t('who.name')}>
            {({ id }) => (
              <TextInput
                id={id}
                value={name}
                maxLength={LIMITS.name}
                autoComplete="nickname"
                dir="auto"
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
                className="size-6 shrink-0 accent-[var(--owl-brand)]"
                checked={wantPassword}
                aria-describedby={`${formId}-protect-hint`}
                onChange={(event) => setWantPassword(event.target.checked)}
              />
              <div>
                <label
                  htmlFor={`${formId}-protect`}
                  className="inline-block min-h-6 font-bold"
                >
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
  focusNext,
  onSession,
  store,
}: {
  data: EventSnapshotData;
  participant: ParticipantViewData;
  session: Session;
  focusNext: RefObject<'greeting' | 'who' | null>;
  onSession(session: Session | null): void;
  store: EventStore;
}) {
  const { t } = useI18n();
  const helloRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (focusNext.current !== 'greeting') return;
    focusNext.current = null;
    helloRef.current?.focus();
  }, [focusNext]);
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
      if (sessionRevoked(failure, credentials)) {
        onSession(null);
        return;
      }
      setMessage({ tone: 'error', text: errorMessage(failure, t) });
    }
  };

  const deleteEntry = async () => {
    try {
      await api.deleteParticipant(data.event.id, participant.id, credentials);
      onSession(null);
      void store.refresh();
    } catch (failure) {
      if (sessionRevoked(failure, credentials)) {
        onSession(null);
        return;
      }
      setMessage({
        tone: 'error',
        text: errorMessage(failure, t),
      });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          ref={helloRef}
          tabIndex={-1}
          className="text-lg font-extrabold outline-none"
        >
          {t('mine.hello', { name: isolate(participant.name) })}
        </p>
        <div className="flex flex-wrap gap-2">
          {!locked && (
            <Button
              size="sm"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {t('mine.entry')}
            </Button>
          )}
          <Button size="sm" onClick={() => onSession(null)}>
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
                    dir="auto"
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
              if (passwordLongEnough(password)) void update({ password });
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
              <Button
                variant="dangerOutline"
                onClick={() => setConfirmDelete(true)}
              >
                <TrashIcon size={18} /> {t('mine.deleteEntry')}
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
  const [noteStatus, setNoteStatus] = useState<NoteStatus>('idle');
  const noteFocused = useRef(false);
  // Typed and not yet stored: only then does leaving the field write the note.
  const noteDirty = useRef(false);
  const noteText = useRef(note);
  noteText.current = note;
  // The note as the server holds it, to tell a change from a mere blur.
  const savedNote = useRef(participant.note);
  const credentialsRef = useRef(credentials);
  credentialsRef.current = credentials;
  const participantRef = useRef(participant);
  participantRef.current = participant;
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
        marks: joinMarks(participant.yes, participant.maybe),
        onMerged: (merged) => setMarks(merged),
        send: marksSender({
          put: (request) =>
            api.putMarks(
              eventId,
              participant.id,
              request,
              credentialsRef.current
            ),
          candidates: () => candidatesRef.current,
        }),
        onStatus: (next, error) => {
          setStatus(next);
          setSaveError(next === 'failed' || next === 'retrying' ? error : null);
          // The poll closed under unsaved marks: show what the server holds.
          if (next === 'failed' && closedFailure(error)) {
            const server = participantRef.current;
            setMarks(joinMarks(server.yes, server.maybe));
            void store.refresh();
          }
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
      const server = joinMarks(participant.yes, participant.maybe);
      queue.adopt(participant.rev, server);
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
    retrying: t(saveMessageKey('retrying', saveError) ?? 'mine.retrying'),
    failed: saveMessageKey('failed', saveError)
      ? t('mine.closed')
      : errorMessage(saveError, t),
  };
  const shown = shownStatus(status, noteStatus);
  // Answered without a single day: the saved state says what was saved.
  const noDays = !locked && marks.size === 0 && participant.answered;
  const done = shown === 'saved' || (shown === 'idle' && noDays);

  // The note changed elsewhere — another device, the organiser: show it, unless
  // it is being typed in, and compare against it from now on.
  useEffect(() => {
    savedNote.current = participant.note;
    if (!noteDirty.current) setNote(participant.note ?? '');
  }, [participant.note]);

  const saveNote = async (keepalive = false) => {
    if (!noteDirty.current) return;
    const typed = noteText.current;
    const change = noteChange(typed, savedNote.current);
    setNote(change.cleaned);
    if (!change.send) {
      noteDirty.current = false;
      return;
    }
    setNoteStatus('saving');
    try {
      await api.updateParticipant(
        eventId,
        participant.id,
        { note: change.value },
        credentials,
        { keepalive }
      );
      savedNote.current = change.value;
      if (noteText.current === typed) noteDirty.current = false;
      setNoteFailed(false);
      setNoteStatus('saved');
      void store.refresh();
    } catch (failure) {
      if (sessionRevoked(failure, credentialsRef.current)) {
        onSessionRef.current(null);
        return;
      }
      setNoteFailed(true);
      setNoteStatus('idle');
    }
  };

  // A note still being typed goes out when the page is hidden or the panel
  // goes away, as the marks do.
  const saveNoteRef = useRef(saveNote);
  saveNoteRef.current = saveNote;
  useEffect(() => {
    const leave = (): void => void saveNoteRef.current(true);
    const hide = (): void => {
      if (document.visibilityState === 'hidden') leave();
    };
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('pagehide', leave);
      document.removeEventListener('visibilitychange', hide);
      leave();
    };
  }, []);

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
      {!locked && marks.size === 0 && !participant.answered && (
        <div>
          <Button onClick={() => queue.push(new Map())}>
            {t('mine.noneWork')}
          </Button>
        </div>
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
              dir="auto"
              onChange={(event) => {
                noteDirty.current = true;
                setNote(event.target.value);
                setNoteFailed(false);
                setNoteStatus('idle');
              }}
              onFocus={() => {
                noteFocused.current = true;
              }}
              onBlur={() => {
                noteFocused.current = false;
                void saveNote();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !isImeKey(event.nativeEvent))
                  (event.target as HTMLInputElement).blur();
              }}
            />
          )}
        </Field>
      )}
      <div className="flex min-h-6 items-center text-sm">
        <span
          role="status"
          aria-live="polite"
          className={`inline-flex items-center gap-1 font-bold ${
            shown === 'failed'
              ? 'text-danger'
              : done
                ? 'text-yes-text'
                : 'text-muted'
          }`}
        >
          {done && <CheckIcon size={14} />}{' '}
          {done && noDays ? t('mine.noneSaved') : statusText[shown]}
        </span>
      </div>
    </div>
  );
}
