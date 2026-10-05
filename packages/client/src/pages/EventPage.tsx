import {
  EMOJIS,
  emojiIcon,
  formatDay,
  formatDayRange,
  googleCalendarUrl,
  todayLocal,
  type EventSnapshotData,
} from '@owl/shared';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AdminPanel } from '../components/AdminPanel.tsx';
import { EventViews } from '../components/EventViews.tsx';
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
import { Link } from '../App.tsx';
import { Button, Card, Notice } from '../components/ui.tsx';
import { useI18n } from '../i18n/index.tsx';
import { api, calendarFileUrl } from '../lib/api.ts';
import { setFavicon } from '../lib/favicon.ts';
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
 * The organiser key arrives in the URL fragment. It is removed from the
 * address bar at once, so that copying the address shares the event — not the
 * right to delete it. Without a key on this device it is stored right away;
 * one that would replace a different key is handed back to be checked first,
 * so a link with a made-up key cannot cost the organiser their access.
 */
function takeAdminTokenFromFragment(eventId: string): string | null {
  const hash = window.location.hash;
  if (!hash.startsWith('#admin=')) return null;
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname
  );
  const match = /^#admin=([\w-]{20,128})$/.exec(hash);
  if (!match) return null;
  const candidate = match[1]!;
  const stored = readAdminToken(eventId);
  if (stored === candidate) return null;
  if (stored === null) {
    writeAdminToken(eventId, candidate);
    return null;
  }
  return candidate;
}

export function EventPage({
  id,
  publicUrl,
}: {
  id: string;
  publicUrl: string | null;
}) {
  const { t } = useI18n();
  const candidate = useMemo(() => takeAdminTokenFromFragment(id), [id]);
  const { store, state } = useEventStore(id);
  const [adminToken, setAdminToken] = useState(() => readAdminToken(id));

  // A key from the link that differs from the stored one replaces it only if
  // the server says it is this event's.
  useEffect(() => {
    if (candidate === null) return;
    let current = true;
    api
      .checkAdmin(id, candidate)
      .then((valid) => {
        if (!valid || !current) return;
        writeAdminToken(id, candidate);
        setAdminToken(candidate);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [id, candidate]);
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
      // The emoji is the tab's icon; in the title it would show twice.
      document.title = `${loaded.title} · ${t('app.name')}`;
      setFavicon(emojiIcon(EMOJIS[loaded.emoji]));
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
  const [tab, setTab] = useState<'mine' | 'group'>('mine');
  const [editingFor, setEditingFor] = useState<string | null>(null);
  const firstWeekday = useMemo(() => firstWeekdayFor(navigator.language), []);
  const today = todayLocal();
  const { event } = data;
  const answered = data.participants.filter((p) => p.answered).length;
  // Once someone has answered, a quiet word that they can plan their own.
  const me = session
    ? data.participants.find((p) => p.id === session.participantId)
    : undefined;
  const invitePlanning = !adminToken && me?.answered === true;

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

      <EventViews
        mine={mine}
        group={group}
        answered={answered}
        tab={tab}
        onTab={setTab}
      />

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

      {invitePlanning && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="font-extrabold">{t('event.planOwn.title')}</p>
            <p className="text-sm text-muted">{t('event.planOwn.text')}</p>
          </div>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-full bg-brand px-4 font-bold text-brand-ink shadow-card hover:bg-brand-hover"
          >
            {t('home.cta')}
          </Link>
        </Card>
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
