import type { Language } from '@owl/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  hasUnsavedInput,
  holdReload,
  ReloadGuard,
} from '../src/lib/reloadGuard.ts';
import type { Backing } from '../src/lib/storage.ts';

class MemorySession implements Backing {
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

function guardWith(
  session: Backing | null = new MemorySession(),
  online = true
) {
  const reloadPage = vi.fn<() => void>();
  const remember = vi.fn<(language: Language) => void>();
  const guard = new ReloadGuard({
    session,
    reloadPage,
    online: () => online,
    remember,
  });
  return { guard, reloadPage, remember, session };
}

describe('ReloadGuard', () => {
  it('reloads once for a language, remembering it first', () => {
    const { guard, reloadPage, remember } = guardWith();
    expect(guard.reload('ja', 'de')).toBe(true);
    expect(remember).toHaveBeenCalledWith('ja');
    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(guard.flag()).toEqual({ language: 'ja', previous: 'de' });
    // The same language failing again, after the reload: no second one.
    expect(guard.reload('ja', 'de')).toBe(false);
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('reloads for another language, and keeps a missing previous one', () => {
    const { guard, reloadPage } = guardWith();
    guard.reload('ja', 'de');
    expect(guard.reload('fa', null)).toBe(true);
    expect(reloadPage).toHaveBeenCalledTimes(2);
    expect(guard.flag()).toEqual({ language: 'fa', previous: null });
  });

  it('never reloads offline', () => {
    const { guard, reloadPage, remember, session } = guardWith(
      new MemorySession(),
      false
    );
    expect(guard.reload('ja', 'de')).toBe(false);
    expect(reloadPage).not.toHaveBeenCalled();
    expect(remember).not.toHaveBeenCalled();
    expect((session as MemorySession).map.size).toBe(0);
  });

  it('never reloads without a flag that survives the reload', () => {
    const throwing: Backing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    };
    const forgetful: Backing = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    for (const session of [null, throwing, forgetful]) {
      const { guard, reloadPage, remember } = guardWith(session);
      expect(guard.reload('ja', 'de')).toBe(false);
      expect(reloadPage).not.toHaveBeenCalled();
      expect(remember).not.toHaveBeenCalled();
    }
  });

  it('forgets the reload once its language has loaded, and only then', () => {
    const { guard } = guardWith();
    guard.reload('ja', 'de');
    guard.loaded('fa');
    expect(guard.flag()?.language).toBe('ja');
    guard.loaded('ja');
    expect(guard.flag()).toBeNull();
    // Nothing to forget: no harm.
    guard.loaded('ja');
    expect(guard.flag()).toBeNull();
  });

  it('reads a damaged flag as none', () => {
    for (const raw of [
      '{',
      '"ja"',
      '{"language":"xx","previous":null}',
      '{}',
    ]) {
      const session = new MemorySession();
      session.setItem('owl.i18n-reload', raw);
      const { guard, reloadPage } = guardWith(session);
      expect(guard.flag(), raw).toBeNull();
      expect(guard.reload('ja', null), raw).toBe(true);
      expect(reloadPage).toHaveBeenCalledTimes(1);
    }
  });
});

describe('ReloadGuard with unsaved input', () => {
  it('does not reload while a registered form is dirty, and does once it is clean', () => {
    const { guard, reloadPage, remember } = guardWith();
    let dirty = true;
    const release = holdReload(() => dirty);
    try {
      expect(hasUnsavedInput()).toBe(true);
      expect(guard.reload('ja', 'de')).toBe(false);
      expect(reloadPage).not.toHaveBeenCalled();
      expect(remember).not.toHaveBeenCalled();
      // No flag was left behind: the next failure may still reload.
      expect(guard.flag()).toBeNull();
      dirty = false;
      expect(guard.reload('ja', 'de')).toBe(true);
      expect(reloadPage).toHaveBeenCalledTimes(1);
    } finally {
      release();
    }
  });

  it('forgets a registration once released, and keeps the others', () => {
    const { guard } = guardWith();
    const first = holdReload(() => true);
    const second = holdReload(() => true);
    first();
    first(); // releasing twice is harmless
    expect(hasUnsavedInput()).toBe(true);
    second();
    expect(hasUnsavedInput()).toBe(false);
    expect(guard.reload('ja', null)).toBe(true);
  });

  it('counts a registration that is clean as none, and none as clean', () => {
    expect(hasUnsavedInput()).toBe(false);
    const release = holdReload(() => false);
    expect(hasUnsavedInput()).toBe(false);
    release();
  });

  it('lets a caller give its own check', () => {
    const reloadPage = vi.fn<() => void>();
    const guard = new ReloadGuard({
      session: new MemorySession(),
      reloadPage,
      online: () => true,
      remember: () => undefined,
      unsaved: () => true,
    });
    expect(guard.reload('ja', null)).toBe(false);
    expect(reloadPage).not.toHaveBeenCalled();
  });
});
