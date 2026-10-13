import { readAdminToken, writeAdminToken } from './prefs.ts';

/**
 * The organiser key arrives in the URL fragment. It is removed from the
 * address bar at once, so that copying the address shares the event — not the
 * right to delete it. Without a key on this device it is stored right away;
 * one that would replace a different key is handed back to be checked first,
 * so a link with a made-up key cannot cost the organiser their access.
 */
export function takeAdminTokenFromFragment(eventId: string): string | null {
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
