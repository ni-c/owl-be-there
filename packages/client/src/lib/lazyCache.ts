/** Values loaded once, on first use, and kept. */
export interface LazyCache<K extends string, V> {
  /** The value if it is ready: given from the start, or loaded before. */
  peek(key: K): V | undefined;
  /**
   * The value, loaded on first use. Callers asking while a load is under way
   * share it; a failure is not kept, so the next call loads again.
   */
  load(key: K): Promise<V>;
}

export function createLazyCache<K extends string, V>(
  loaders: Partial<Record<K, () => Promise<V>>>,
  ready: Partial<Record<K, V>>
): LazyCache<K, V> {
  const loaded = new Map<K, V>(Object.entries(ready) as [K, V][]);
  const pending = new Map<K, Promise<V>>();
  return {
    peek: (key) => loaded.get(key),
    load(key) {
      const value = loaded.get(key);
      if (value !== undefined) return Promise.resolve(value);
      const running = pending.get(key);
      if (running) return running;
      const loader = loaders[key];
      if (!loader) return Promise.reject(new Error(`Nothing loads ${key}`));
      // A loader that throws rejects like one whose promise fails.
      const promise = new Promise<V>((resolve) => resolve(loader())).then(
        (result) => {
          loaded.set(key, result);
          pending.delete(key);
          return result;
        },
        (error: unknown) => {
          pending.delete(key);
          throw error;
        }
      );
      pending.set(key, promise);
      return promise;
    },
  };
}
