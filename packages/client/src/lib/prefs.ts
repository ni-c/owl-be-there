import {
  EMOJI_KEYS,
  isId,
  LanguageSchema,
  type EmojiKey,
  type Language,
} from '@owl/shared';
import { z } from 'zod';
import { browserBacking, Store } from './storage.ts';

/**
 * Everything the browser remembers, and nothing the server does: the theme,
 * the language, who you are in each event, the organiser keys, and the list of
 * events on this device. All of it lives in localStorage under `owl.*`, and
 * every read is checked against a schema.
 */
export const store = new Store(browserBacking());

export type ThemeChoice = 'system' | 'light' | 'dark';

const ThemeSchema = z.enum(['light', 'dark']);

export function readTheme(): ThemeChoice {
  return store.read('owl.theme', ThemeSchema) ?? 'system';
}

/** Persist the choice and stamp it on the document, as the inline script does on load. */
export function writeTheme(theme: ThemeChoice): void {
  if (theme === 'system') {
    store.remove('owl.theme');
    document.documentElement.removeAttribute('data-theme');
  } else {
    store.write('owl.theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export function readLanguage(): Language | null {
  return store.read('owl.lang', LanguageSchema);
}

export function writeLanguage(language: Language): void {
  store.write('owl.lang', language);
}

const SessionSchema = z.object({
  participantId: z.string().refine(isId),
  token: z.string(),
});

export type Session = z.infer<typeof SessionSchema>;

export function readSession(eventId: string): Session | null {
  return store.read(`owl.session.${eventId}`, SessionSchema);
}

export function writeSession(eventId: string, session: Session): void {
  store.write(`owl.session.${eventId}`, session);
}

export function clearSession(eventId: string): void {
  store.remove(`owl.session.${eventId}`);
}

/** Keep this device's session for an event, or forget it for `null`. */
export function storeSession(eventId: string, session: Session | null): void {
  if (session) writeSession(eventId, session);
  else clearSession(eventId);
}

export function readAdminToken(eventId: string): string | null {
  return store.read(`owl.admin.${eventId}`, z.string().min(20).max(128));
}

export function writeAdminToken(eventId: string, token: string): void {
  store.write(`owl.admin.${eventId}`, token);
}

const MyEventSchema = z.object({
  id: z.string().refine(isId),
  title: z.string(),
  emoji: z.enum(EMOJI_KEYS),
  role: z.enum(['organiser', 'participant']),
});

export type MyEvent = z.infer<typeof MyEventSchema>;

/** How many events the list on the start page keeps. */
const MAX_MY_EVENTS = 50;

/**
 * The events on this device, most recently seen first. Entries are checked
 * one by one, so a single damaged entry costs that entry, not the list.
 */
export function readMyEvents(): MyEvent[] {
  const raw = store.read('owl.events', z.array(z.unknown())) ?? [];
  return raw.flatMap((entry) => {
    const parsed = MyEventSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Remember an event on this device. An organiser stays an organiser even when
 * they later open the plain link; the list keeps the fifty most recent.
 */
export function rememberEvent(
  event: { id: string; title: string; emoji: EmojiKey },
  role: MyEvent['role']
): void {
  const existing = readMyEvents();
  const previous = existing.find((entry) => entry.id === event.id);
  const entry: MyEvent = {
    id: event.id,
    title: event.title,
    emoji: event.emoji,
    role: previous?.role === 'organiser' ? 'organiser' : role,
  };
  const list = [entry, ...existing.filter((other) => other.id !== event.id)];
  store.write('owl.events', list.slice(0, MAX_MY_EVENTS));
  // An entry pushed off the end can no longer be forgotten from the list, so
  // its session and organiser key go with it.
  for (const dropped of list.slice(MAX_MY_EVENTS)) dropKeys(dropped.id);
}

function dropKeys(eventId: string): void {
  clearSession(eventId);
  store.remove(`owl.admin.${eventId}`);
}

/** Forget an event entirely: the list entry, the session and the organiser key. */
export function forgetEvent(eventId: string): void {
  store.write(
    'owl.events',
    readMyEvents().filter((entry) => entry.id !== eventId)
  );
  dropKeys(eventId);
}
