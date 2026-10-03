import {
  EMOJIS,
  formatDay,
  formatDayRange,
  googleCalendarUrl,
  todayLocal,
  type EventSnapshotData,
} from '@owl/shared';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AdminPanel } from '../components/AdminPanel.tsx';
import { GroupView } from '../components/GroupView.tsx';
import {
  CalendarIcon,
  ClockIcon,
  PinIcon,
  ShareIcon,
  UserIcon,
  UsersIcon,
} from '../components/icons.tsx';
import { MyDays } from '../components/MyDays.tsx';
import { Owl } from '../components/Owl.tsx';
import { ShareDialog } from '../components/ShareDialog.tsx';
import { Button, Card, Notice } from '../components/ui.tsx';
import { useI18n } from '../i18n/index.tsx';
import { calendarFileUrl } from '../lib/api.ts';
import { useEventStore } from '../hooks/useEventStore.ts';
import type { EventStore } from '../lib/eventStore.ts';
import { firstWeekdayFor } from '../lib/locale.ts';
import { eventLink } from '../lib/links.ts';
import {
  readAdminToken,
  readSession,
  rememberEvent,
  writeAdminToken,
  type Session,
} from '../lib/prefs.ts';

/**
 * The organiser key arrives in the URL fragment. It is moved into local
 * storage and removed from the address bar at once, so that copying the
 * address shares the event — not the right to delete it.
 */
function takeAdminTokenFromFragment(eventId: string): void {
  const match = /^#admin=([\w-]{20,128})$/.exec(window.location.hash);
  if (!match) return;
  writeAdminToken(eventId, match[1]!);
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname
  );
}

/** Wide enough for the two views side by side (56rem). */
function useWide(): boolean {
  const query = '(min-width: 56rem)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setWide(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, []);
  return wide;
}

export function EventPage({
  id,
  publicUrl,
}: {
  id: string;
  publicUrl: string | null;
}) {
  const { t } = useI18n();
  useMemo(() => takeAdminTokenFromFragment(id), [id]);
  const { store, state } = useEventStore(id);
  const [adminToken, setAdminToken] = useState(() => readAdminToken(id));
  const [session, setSession] = useState<Session | null>(() => readSession(id));
  const [shareOpen, setShareOpen] = useState(() =>
    Boolean((window.history.state as { created?: boolean } | null)?.created)
  );
  const [justCreated] = useState(shareOpen);

  useEffect(() => {
    if (justCreated)
      window.history.replaceState(null, '', window.location.pathname);
  }, [justCreated]);

  // Remember the event on this device once it has loaded.
  const loaded = state.status === 'ready' ? state.data.event : null;
  useEffect(() => {
    if (loaded) {
      rememberEvent(loaded, adminToken ? 'organiser' : 'participant');
      document.title = `${EMOJIS[loaded.emoji]} ${loaded.title} · ${t('app.name')}`;
    }
  }, [loaded, adminToken, t]);

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col items-center gap-4 py-20" role="status">
        <Owl mood="thinking" size={120} bob />
        <p className="font-bold text-muted">{t('event.loading')}</p>
      </div>
    );
  }
  if (
    state.status === 'not-found' ||
    state.status === 'deleted' ||
    state.status === 'error'
  ) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <Owl
          mood={state.status === 'error' ? 'confused' : 'sleeping'}
          size={150}
        />
        <h1 className="text-3xl font-black">
          {state.status === 'deleted'
            ? t('event.deleted')
            : state.status === 'error'
              ? t('error.generic')
              : t('event.notFound.title')}
        </h1>
        {state.status === 'not-found' && (
          <p className="max-w-lg text-muted">{t('event.notFound.text')}</p>
        )}
      </div>
    );
  }

  return (
    <EventView
      data={state.data}
      stale={state.stale}
      store={store}
      adminToken={adminToken}
      onAdminLost={() => setAdminToken(null)}
      session={session}
      onSession={setSession}
      shareOpen={shareOpen}
      onShare={setShareOpen}
      justCreated={justCreated}
      publicUrl={publicUrl}
    />
  );
}

interface EventViewProps {
  data: EventSnapshotData;
  stale: boolean;
  store: EventStore;
  adminToken: string | null;
  onAdminLost(): void;
  session: Session | null;
  onSession(session: Session | null): void;
  shareOpen: boolean;
  onShare(open: boolean): void;
  justCreated: boolean;
  publicUrl: string | null;
}

function EventView(props: EventViewProps) {
  const { data, stale, store, adminToken, session, onSession } = props;
  const { t, tn, locale } = useI18n();
  const wide = useWide();
  const [tab, setTab] = useState<'mine' | 'group'>('mine');
  const [editingFor, setEditingFor] = useState<string | null>(null);
  const firstWeekday = useMemo(() => firstWeekdayFor(navigator.language), []);
  const today = todayLocal();
  const { event } = data;
  const answered = data.participants.filter((p) => p.answered).length;

  const shared = {
    data,
    store,
    adminToken,
    firstWeekday,
    today,
  };

  const mine = (
    <MyDays
      {...shared}
      session={session}
      onSession={onSession}
      editingFor={editingFor}
      onStopEditing={() => setEditingFor(null)}
    />
  );
  const group = <GroupView {...shared} />;

  return (
    <div className="flex flex-col gap-5">
      <EventHeader data={data} onShare={() => props.onShare(true)} />
      {stale && <Notice>{t('event.stale')}</Notice>}
      <StatusBanner data={data} publicUrl={props.publicUrl} />

      {wide ? (
        <div className="grid grid-cols-2 items-start gap-5">
          <Card>
            <h2 className="mb-4 text-xl font-extrabold">
              {t('event.tabMine')}
            </h2>
            {mine}
          </Card>
          <Card>
            <h2 className="mb-4 text-xl font-extrabold">
              {t('event.tabGroup')}{' '}
              <span className="text-base font-bold text-muted">
                · {tn('event.answers', answered)}
              </span>
            </h2>
            {group}
          </Card>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div
            role="tablist"
            aria-label={t('event.tabs')}
            className="grid grid-cols-2 rounded-full border-2 border-line bg-sunken p-1"
          >
            {(['mine', 'group'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                id={`tab-${value}`}
                aria-selected={tab === value}
                aria-controls={`panel-${value}`}
                tabIndex={tab === value ? 0 : -1}
                onClick={() => setTab(value)}
                onKeyDown={(keyEvent) => {
                  if (
                    keyEvent.key === 'ArrowRight' ||
                    keyEvent.key === 'ArrowLeft'
                  ) {
                    keyEvent.preventDefault();
                    const next = value === 'mine' ? 'group' : 'mine';
                    setTab(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  }
                }}
                className={`min-h-11 rounded-full font-extrabold transition ${tab === value ? 'bg-surface shadow-card' : 'text-muted'}`}
              >
                {value === 'mine' ? (
                  t('event.tabMine')
                ) : (
                  <>
                    {t('event.tabGroup')}
                    <span
                      aria-hidden="true"
                      className="ml-1.5 inline-grid min-w-6 place-items-center rounded-full bg-line px-1.5 text-sm text-ink"
                    >
                      {answered}
                    </span>
                    <span className="sr-only">
                      , {tn('event.answers', answered)}
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
          >
            <Card>{tab === 'mine' ? mine : group}</Card>
          </div>
        </div>
      )}

      {adminToken && (
        <AdminPanel
          data={data}
          store={store}
          adminToken={adminToken}
          onAdminLost={props.onAdminLost}
          firstWeekday={firstWeekday}
          today={today}
          onFillIn={(participantId) => {
            setEditingFor(participantId);
            setTab('mine');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      <p className="text-center text-sm text-muted">
        {t('event.expires', {
          date: formatDay(event.expiresOn, locale, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        })}
      </p>

      <ShareDialog
        open={props.shareOpen}
        onClose={() => props.onShare(false)}
        event={event}
        adminToken={adminToken}
        justCreated={props.justCreated}
        publicUrl={props.publicUrl}
      />
      <span className="sr-only">
        {tn('event.duration', event.durationDays)}
      </span>
    </div>
  );
}

function EventHeader({
  data,
  onShare,
}: {
  data: EventSnapshotData;
  onShare(): void;
}) {
  const { t, tn } = useI18n();
  const { event } = data;
  const meta = [
    event.location && { icon: <PinIcon size={16} />, text: event.location },
    event.creatorName && {
      icon: <UserIcon size={16} />,
      text: t('event.organisedBy', { name: event.creatorName }),
    },
    event.durationDays > 1 && {
      icon: <ClockIcon size={16} />,
      text: tn('event.duration', event.durationDays),
    },
    event.minCount !== null && {
      icon: <UsersIcon size={16} />,
      text: tn('event.minCount', event.minCount),
    },
  ].filter(Boolean) as { icon: ReactNode; text: string }[];
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h1 className="flex items-start gap-3 text-3xl leading-tight font-black sm:text-4xl">
          <span aria-hidden="true">{EMOJIS[event.emoji]}</span>
          <span className="break-words">{event.title}</span>
        </h1>
        <Button variant="primary" onClick={onShare} className="shrink-0">
          <ShareIcon />
          <span>{t('event.share')}</span>
        </Button>
      </div>
      {meta.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {meta.map((item) => (
            <li
              key={item.text}
              className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-3 py-1 text-sm font-bold"
            >
              {item.icon}
              {item.text}
            </li>
          ))}
        </ul>
      )}
      {event.description && (
        // Plain text on purpose: nothing an organiser writes becomes a link.
        <p className="max-w-3xl leading-relaxed whitespace-pre-line text-muted">
          {event.description}
        </p>
      )}
    </header>
  );
}

function StatusBanner({
  data,
  publicUrl,
}: {
  data: EventSnapshotData;
  publicUrl: string | null;
}) {
  const { t, locale } = useI18n();
  const { event } = data;
  if (event.status === 'open') return null;
  if (event.status === 'closed' || !event.finalStart || !event.finalEnd) {
    return <Notice>{t('event.closed')}</Notice>;
  }
  const when = formatDayRange(event.finalStart, event.finalEnd, locale);
  const google = googleCalendarUrl({
    title: event.title,
    description: event.description,
    location: event.location,
    start: event.finalStart,
    end: event.finalEnd,
    url: eventLink(publicUrl, event.id, window.location.origin),
  });
  return (
    <section className="flex flex-col items-center gap-4 rounded-3xl border-2 border-brand bg-brand-soft p-5 text-center sm:flex-row sm:text-left">
      <Owl mood="celebrating" size={96} />
      <div className="flex flex-1 flex-col gap-1">
        <p className="text-sm font-extrabold tracking-wide text-muted uppercase">
          {t('event.decided')}
        </p>
        <p className="text-2xl font-black">{when}</p>
      </div>
      <div
        className="flex flex-wrap justify-center gap-2"
        aria-label={t('event.addToCalendar')}
        role="group"
      >
        <a
          href={calendarFileUrl(event.id)}
          download="owl-be-there.ics"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 font-bold shadow-card"
        >
          <CalendarIcon /> {t('event.icsFile')}
        </a>
        <a
          href={google}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 font-bold shadow-card"
        >
          {t('event.google')}
        </a>
      </div>
    </section>
  );
}
