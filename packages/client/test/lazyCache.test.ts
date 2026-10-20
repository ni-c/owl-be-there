import { describe, expect, it, vi } from 'vitest';
import { createLazyCache } from '../src/lib/lazyCache.ts';

/** A promise whose outcome the test decides. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('createLazyCache', () => {
  it('has what it was given at once, and nothing else', async () => {
    const load = vi.fn(() => Promise.resolve('B'));
    const cache = createLazyCache<'a' | 'b', string>({ b: load }, { a: 'A' });
    expect(cache.peek('a')).toBe('A');
    expect(cache.peek('b')).toBeUndefined();
    await expect(cache.load('a')).resolves.toBe('A');
    expect(load).not.toHaveBeenCalled();
  });

  it('loads once and keeps the value', async () => {
    const load = vi.fn(() => Promise.resolve('B'));
    const cache = createLazyCache<'b', string>({ b: load }, {});
    await expect(cache.load('b')).resolves.toBe('B');
    await expect(cache.load('b')).resolves.toBe('B');
    expect(cache.peek('b')).toBe('B');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('shares one load among callers asking at the same time', async () => {
    const gate = deferred<string>();
    const load = vi.fn(() => gate.promise);
    const cache = createLazyCache<'b', string>({ b: load }, {});
    const first = cache.load('b');
    const second = cache.load('b');
    expect(second).toBe(first);
    expect(cache.peek('b')).toBeUndefined();
    gate.resolve('B');
    await expect(Promise.all([first, second])).resolves.toEqual(['B', 'B']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('fails every waiter, keeps nothing, and loads again on the next call', async () => {
    const gate = deferred<string>();
    const load = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(gate.promise)
      .mockResolvedValueOnce('B');
    const cache = createLazyCache<'b', string>({ b: load }, {});
    const first = cache.load('b');
    const second = cache.load('b');
    gate.reject(new Error('offline'));
    await expect(first).rejects.toThrow('offline');
    await expect(second).rejects.toThrow('offline');
    expect(cache.peek('b')).toBeUndefined();
    await expect(cache.load('b')).resolves.toBe('B');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('rejects for a loader that throws, and for a key nothing loads', async () => {
    const cache = createLazyCache<'b' | 'c', string>(
      {
        b: () => {
          throw new Error('broken');
        },
      },
      {}
    );
    await expect(cache.load('b')).rejects.toThrow('broken');
    await expect(cache.load('c')).rejects.toThrow('Nothing loads c');
  });

  it('keeps keys apart', async () => {
    const cache = createLazyCache<'b' | 'c', string>(
      {
        b: () => Promise.resolve('B'),
        c: () => Promise.reject(new Error('x')),
      },
      {}
    );
    await expect(cache.load('c')).rejects.toThrow('x');
    await expect(cache.load('b')).resolves.toBe('B');
    expect(cache.peek('c')).toBeUndefined();
  });
});
