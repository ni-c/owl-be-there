import { isId, isLanguage, type Language } from '@owl/shared';

/**
 * Five pages need no router library: the path, a way to change it, and a
 * subscription to the browser's back and forward buttons.
 */
export type Route =
  /** `/de`, `/fr` …: the start page in that language, for search engines. */
  | { page: 'home'; language?: Language }
  | { page: 'event'; id: string }
  | { page: 'privacy' }
  | { page: 'imprint' }
  | { page: 'not-found' };

export function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { page: 'home' };
  // The server answers these with and without a trailing slash; so does the app.
  if (/^\/privacy\/?$/.test(pathname)) return { page: 'privacy' };
  if (/^\/imprint\/?$/.test(pathname)) return { page: 'imprint' };
  const home = /^\/([a-z]{2})\/?$/.exec(pathname);
  if (home && isLanguage(home[1]!)) return { page: 'home', language: home[1] };
  const event = /^\/e\/([^/]+)\/?$/.exec(pathname);
  if (event && isId(event[1]!)) return { page: 'event', id: event[1]! };
  return { page: 'not-found' };
}

const listeners = new Set<() => void>();

/** Be told when the path changes, by `navigate` or the back button. */
export function subscribeToRoute(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

export function navigate(
  path: string,
  options: {
    replace?: boolean;
    state?: Record<string, unknown>;
    /** Stay where the page is scrolled to, for a change of address only. */
    keepScroll?: boolean;
  } = {}
): void {
  const state = options.state ?? null;
  // A link to the page one is on is no new place: Back must not have to click
  // through copies of it.
  const here = window.location.pathname + window.location.search;
  if (options.replace) window.history.replaceState(state, '', path);
  else if (path !== here) window.history.pushState(state, '', path);
  else if (options.state) window.history.replaceState(state, '', path);
  if (!options.keepScroll) window.scrollTo({ top: 0 });
  for (const listener of listeners) listener();
}
