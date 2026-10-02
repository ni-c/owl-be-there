import type { z } from 'zod';

/** The part of `Storage` this module uses, so a test can hand in its own. */
export interface Backing {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * `localStorage`, or null when the browser refuses it.
 *
 * Safari in private mode, some in-app browsers and a "block all site data"
 * setting all throw on access rather than returning nothing. Probed once with a
 * write, because a few of them allow reading and refuse only the write.
 */
export function browserBacking(): Backing | null {
  try {
    const storage = window.localStorage;
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

  constructor(backing: Backing | null) {
    this.backing = backing;
  }

  read<T>(key: string, schema: z.ZodType<T>): T | null {
    let raw: string | null;
    try {
      raw = this.backing?.getItem(key) ?? null;
    } catch {
      raw = null;
    }
    raw ??= this.memory.get(key) ?? null;
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

  write(key: string, value: unknown): void {
    const raw = JSON.stringify(value);
    this.memory.set(key, raw);
    try {
      this.backing?.setItem(key, raw);
    } catch {
      // Full or blocked: the memory copy still serves this tab.
    }
  }

  remove(key: string): void {
    this.memory.delete(key);
    try {
      this.backing?.removeItem(key);
    } catch {
      // Nothing to undo: the memory copy is gone either way.
    }
  }
}
