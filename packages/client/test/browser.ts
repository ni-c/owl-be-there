/**
 * Just enough of a browser for the client's `lib/` to run in Node: a window
 * with history and storage, a document element, and fetch and EventSource
 * fakes the tests control.
 */
import { vi } from 'vitest';

export class MemoryStorage {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

export function installBrowser() {
  const storage = new MemoryStorage();
  const attributes = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();
  const location = {
    pathname: '/',
    hash: '',
    origin: 'https://owl.example.org',
  };
  const window = {
    localStorage: storage,
    location,
    history: {
      state: null as unknown,
      pushState(state: unknown, _title: string, path: string) {
        this.state = state;
        location.pathname = path;
      },
      replaceState(state: unknown, _title: string, path: string) {
        this.state = state;
        location.pathname = path;
      },
    },
    scrollTo: vi.fn(),
    addEventListener(type: string, listener: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type: string) {
      for (const listener of listeners.get(type) ?? []) listener();
    },
  };
  const document = {
    documentElement: {
      lang: 'en',
      setAttribute: (name: string, value: string) =>
        attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name),
      getAttribute: (name: string) => attributes.get(name) ?? null,
    },
  };
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', document);
  return { window, document, storage, attributes };
}

/** A fake EventSource that records instances so a test can push events. */
export class FakeEventSource {
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readonly url: string;
  readyState = 1;
  closed = false;
  private readonly handlers = new Map<
    string,
    ((event: { data: string }) => void)[]
  >();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(
    type: string,
    handler: (event: { data: string }) => void
  ): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  emit(type: string, data = ''): void {
    for (const handler of this.handlers.get(type) ?? []) handler({ data });
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
}

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(status === 304 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}
