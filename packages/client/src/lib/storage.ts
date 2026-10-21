import type { z } from 'zod';

/** The part of `Storage` this module uses, so a test can hand in its own. */
export interface Backing {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * `localStorage` (or `sessionStorage`), or null when the browser refuses it.
 *
 * Safari in private mode, some in-app browsers and a "block all site data"
 * setting all throw on access rather than returning nothing. Probed once with a
 * write, because a few of them allow reading and refuse only the write.
 */
export function browserBacking(
  kind: 'localStorage' | 'sessionStorage' = 'localStorage'
): Backing | null {
  try {
    const storage = window[kind];
    const probe = '__owl_probe__';
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/**
 * JSON values in browser storage, validated on the way out.
 *
 * Every read goes through a schema, because what is stored was written by an
 * older version of this code — or by a person with the developer tools open.
 * Anything that does not match reads as absent. A memory copy keeps the current
 * tab working when the browser refuses to persist anything at all.
 */
export class Store {
  private readonly backing: Backing | null;
  private readonly memory = new Map<string, string>();
  // Keys whose last write or removal the backing refused: memory is newer.
  private readonly unsynced = new Set<string>();

  constructor(backing: Backing | null) {
    this.backing = backing;
  }

  read<T>(key: string, schema: z.ZodType<T>): T | null {
    const raw = this.raw(key);
    if (raw === null) return null;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }

  /**
   * The stored text. A backing that answers is the truth, so data removed
   * elsewhere (another tab, the developer tools) stays removed; memory serves
   * when there is no backing, it throws, or it refused our last change.
   */
  private raw(key: string): string | null {
    if (this.backing && !this.unsynced.has(key)) {
      try {
        const stored = this.backing.getItem(key);
        if (stored === null) this.memory.delete(key);
        else this.memory.set(key, stored);
        return stored;
      } catch {
        // Fall through to the memory copy.
      }
    }
    return this.memory.get(key) ?? null;
  }

  write(key: string, value: unknown): void {
    const raw = JSON.stringify(value);
    this.memory.set(key, raw);
    try {
      this.backing?.setItem(key, raw);
      this.unsynced.delete(key);
    } catch {
      // Full or blocked: the memory copy still serves this tab.
      this.unsynced.add(key);
    }
  }

  remove(key: string): void {
    this.memory.delete(key);
    try {
      this.backing?.removeItem(key);
      this.unsynced.delete(key);
    } catch {
      // The memory copy is gone; the key reads as absent from now on.
      this.unsynced.add(key);
    }
  }
}
