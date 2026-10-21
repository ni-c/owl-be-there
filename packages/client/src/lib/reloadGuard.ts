import { LanguageSchema, type Language } from '@owl/shared';
import { z } from 'zod';
import type { Backing } from './storage.ts';

const FLAG = 'owl.i18n-reload';

const holds = new Set<() => boolean>();

/**
 * Register a check for input that a reload would lose: a form being filled in,
 * marks not yet saved. Returns the undo for an effect's cleanup.
 */
export function holdReload(unsaved: () => boolean): () => void {
  holds.add(unsaved);
  return () => {
    holds.delete(unsaved);
  };
}

/** Whether any registered check reports unsaved input. */
export function hasUnsavedInput(): boolean {
  for (const unsaved of holds) if (unsaved()) return true;
  return false;
}

const FlagSchema = z.object({
  language: LanguageSchema,
  previous: LanguageSchema.nullable(),
});

export type ReloadFlag = z.infer<typeof FlagSchema>;

export interface ReloadGuardDeps {
  /** sessionStorage: the flag lives as long as the tab. */
  session: Backing | null;
  reloadPage(): void;
  online(): boolean;
  /** Store the language as the reader's choice, so the reloaded page opens in it. */
  remember(language: Language): void;
  /** Unsaved input a reload would lose; defaults to the `holdReload` registry. */
  unsaved?(): boolean;
}

/**
 * One reload for a language whose dictionary failed to load. A chunk fails
 * when the app was deployed while the page was open and the old hashed file
 * is gone, and a reload brings the new names; or when the network is down,
 * and then a reload would only show the browser's error page. The flag keeps
 * a second failure of the same language from reloading again.
 */
export class ReloadGuard {
  private readonly deps: ReloadGuardDeps;

  constructor(deps: ReloadGuardDeps) {
    this.deps = deps;
  }

  /** The reload under way, or null; anything malformed reads as none. */
  flag(): ReloadFlag | null {
    try {
      const raw = this.deps.session?.getItem(FLAG);
      if (raw === null || raw === undefined) return null;
      const parsed = FlagSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /**
   * `language` failed to load: reload once to fetch it fresh. True when the
   * page is going away, false when the caller must carry on without it.
   */
  reload(language: Language, previous: Language | null): boolean {
    const { session } = this.deps;
    // Offline the reload would lose the page, and with it marks still waiting
    // to be saved.
    if (!this.deps.online() || !session) return false;
    if ((this.deps.unsaved ?? hasUnsavedInput)()) return false;
    if (this.flag()?.language === language) return false;
    const raw = JSON.stringify({ language, previous });
    try {
      session.setItem(FLAG, raw);
      // A flag that does not survive the reload would let the next failure
      // reload again, and again.
      if (session.getItem(FLAG) !== raw) return false;
    } catch {
      return false;
    }
    this.deps.remember(language);
    this.deps.reloadPage();
    return true;
  }

  /** `language` loaded: the reload made for it has done its job. */
  loaded(language: Language): void {
    if (this.flag()?.language !== language) return;
    try {
      this.deps.session?.removeItem(FLAG);
    } catch {
      // The flag stays; it only stops another reload for this language.
    }
  }
}
