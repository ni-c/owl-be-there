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
