import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MemoryStorage } from './browser.ts';
import { browserBacking, Store, type Backing } from '../src/lib/storage.ts';

class RefusingBacking implements Backing {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
  removeItem(): void {
    throw new Error('SecurityError');
  }
}

const Theme = z.enum(['light', 'dark']);

describe('Store', () => {
  it('round-trips a value through the backing', () => {
    const backing = new MemoryStorage();
    new Store(backing).write('owl.theme', 'dark');
    expect(backing.map.get('owl.theme')).toBe('"dark"');
    expect(new Store(backing).read('owl.theme', Theme)).toBe('dark');
  });

  it('reads a missing key as null', () => {
    expect(new Store(new MemoryStorage()).read('nothing', Theme)).toBeNull();
  });

  it('reads malformed JSON as null', () => {
    const backing = new MemoryStorage();
    backing.map.set('owl.theme', '{nope');
    expect(new Store(backing).read('owl.theme', Theme)).toBeNull();
  });

  it('reads a value that fails its schema as null', () => {
    const backing = new MemoryStorage();
    backing.map.set('owl.theme', '"sepia"');
    expect(new Store(backing).read('owl.theme', Theme)).toBeNull();
  });

  it('removes from both the backing and memory', () => {
    const backing = new MemoryStorage();
    const store = new Store(backing);
    store.write('owl.theme', 'light');
    store.remove('owl.theme');
    expect(backing.map.size).toBe(0);
    expect(store.read('owl.theme', Theme)).toBeNull();
  });

  it('keeps working in memory when the browser refuses storage', () => {
    const store = new Store(new RefusingBacking());
    store.write('owl.theme', 'dark');
    expect(store.read('owl.theme', Theme)).toBe('dark');
    store.remove('owl.theme');
    expect(store.read('owl.theme', Theme)).toBeNull();
  });

  it('works with no backing at all', () => {
    const store = new Store(null);
    store.write('owl.theme', 'light');
    expect(store.read('owl.theme', Theme)).toBe('light');
  });
});

describe('browserBacking', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const setWindow = (value: unknown): void => {
    Object.defineProperty(globalThis, 'window', { value, configurable: true });
  };
  const restore = (): void => {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  };

  it('hands out localStorage when it accepts a write', () => {
    const storage = new MemoryStorage();
    setWindow({ localStorage: storage });
    try {
      expect(browserBacking()).toBe(storage);
      expect(storage.map.size).toBe(0);
    } finally {
      restore();
    }
  });

  it('hands out sessionStorage when asked for it', () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    setWindow({ localStorage: local, sessionStorage: session });
    try {
      expect(browserBacking('sessionStorage')).toBe(session);
      expect(browserBacking()).toBe(local);
      setWindow({ localStorage: local, sessionStorage: new RefusingBacking() });
      expect(browserBacking('sessionStorage')).toBeNull();
    } finally {
      restore();
    }
  });

  it('gives null when the browser refuses storage', () => {
    setWindow({ localStorage: new RefusingBacking() });
    try {
      expect(browserBacking()).toBeNull();
    } finally {
      restore();
    }
  });

  it('gives null where there is no window at all', () => {
    setWindow(undefined);
    try {
      expect(browserBacking()).toBeNull();
    } finally {
      restore();
    }
  });
});

describe('Store against a backing that changes underneath it', () => {
  it('reads a key removed elsewhere as absent, not from memory', () => {
    const backing = new MemoryStorage();
    const store = new Store(backing);
    store.write('owl.theme', 'dark');
    backing.map.delete('owl.theme'); // another tab, or the developer tools
    expect(store.read('owl.theme', Theme)).toBeNull();
    // Stays gone: the memory copy was dropped with it.
    backing.map.set('owl.theme', '"light"');
    expect(store.read('owl.theme', Theme)).toBe('light');
  });

  it('reads a value changed elsewhere', () => {
    const backing = new MemoryStorage();
    const store = new Store(backing);
    store.write('owl.theme', 'dark');
    backing.map.set('owl.theme', '"light"');
    expect(store.read('owl.theme', Theme)).toBe('light');
  });

  it('serves the memory copy while the backing cannot be read', () => {
    let readable = true;
    const backing = new MemoryStorage();
    const store = new Store({
      getItem: (key) => {
        if (!readable) throw new Error('SecurityError');
        return backing.getItem(key);
      },
      setItem: (key, value) => backing.setItem(key, value),
      removeItem: (key) => backing.removeItem(key),
    });
    store.write('owl.theme', 'dark');
    readable = false;
    expect(store.read('owl.theme', Theme)).toBe('dark');
  });

  it('prefers the memory copy of a write the backing refused (quota)', () => {
    const backing = new MemoryStorage();
    backing.map.set('owl.theme', '"light"');
    let full = true;
    const store = new Store({
      getItem: (key) => backing.getItem(key),
      setItem: (key, value) => {
        if (full) throw new Error('QuotaExceededError');
        backing.setItem(key, value);
      },
      removeItem: (key) => backing.removeItem(key),
    });
    store.write('owl.theme', 'dark');
    expect(store.read('owl.theme', Theme)).toBe('dark');
    // A later write that goes through hands the truth back to the backing.
    full = false;
    store.write('owl.theme', 'light');
    backing.map.delete('owl.theme');
    expect(store.read('owl.theme', Theme)).toBeNull();
  });

  it('reads a key as absent when removing it was refused', () => {
    const backing = new MemoryStorage();
    const store = new Store({
      getItem: (key) => backing.getItem(key),
      setItem: (key, value) => backing.setItem(key, value),
      removeItem: () => {
        throw new Error('SecurityError');
      },
    });
    store.write('owl.theme', 'dark');
    store.remove('owl.theme');
    expect(store.read('owl.theme', Theme)).toBeNull();
  });

  it('works without any backing', () => {
    const store = new Store(null);
    expect(store.read('owl.theme', Theme)).toBeNull();
    store.write('owl.theme', 'dark');
    expect(store.read('owl.theme', Theme)).toBe('dark');
    store.remove('owl.theme');
    expect(store.read('owl.theme', Theme)).toBeNull();
  });
});
