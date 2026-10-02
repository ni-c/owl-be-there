/**
 * Four pages need no router library: the path, a way to change it, and a
 * subscription to the browser's back and forward buttons.
 */
export type Route =
  | { page: 'home' }
  | { page: 'event'; id: string }
  | { page: 'privacy' }
  | { page: 'not-found' };

export function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { page: 'home' };
  if (pathname === '/privacy') return { page: 'privacy' };
  const event = /^\/e\/([1-9A-HJ-NP-Za-km-z]{12})\/?$/.exec(pathname);
  if (event) return { page: 'event', id: event[1]! };
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
  options: { replace?: boolean; state?: Record<string, unknown> } = {}
): void {
  const state = options.state ?? null;
  if (options.replace) window.history.replaceState(state, '', path);
  else window.history.pushState(state, '', path);
  window.scrollTo({ top: 0 });
  for (const listener of listeners) listener();
}
