import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Store, type Backing } from '../src/lib/storage.ts';

class MapBacking implements Backing {
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
    const backing = new MapBacking();
    new Store(backing).write('owl.theme', 'dark');
    expect(backing.map.get('owl.theme')).toBe('"dark"');
    expect(new Store(backing).read('owl.theme', Theme)).toBe('dark');
  });

  it('reads a missing key as null', () => {
    expect(new Store(new MapBacking()).read('nothing', Theme)).toBeNull();
  });

  it('reads malformed JSON as null', () => {
    const backing = new MapBacking();
    backing.map.set('owl.theme', '{nope');
    expect(new Store(backing).read('owl.theme', Theme)).toBeNull();
  });

  it('reads a value that fails its schema as null', () => {
    const backing = new MapBacking();
    backing.map.set('owl.theme', '"sepia"');
    expect(new Store(backing).read('owl.theme', Theme)).toBeNull();
  });

  it('removes from both the backing and memory', () => {
    const backing = new MapBacking();
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
