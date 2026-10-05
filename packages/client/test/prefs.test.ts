import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBrowser } from './browser.ts';

const ID = '7gT4kPq2Wx9Z';
const OTHER = 'Kd8mQ3vNp2Ra';

let browser: ReturnType<typeof installBrowser>;
let prefs: typeof import('../src/lib/prefs.ts');

beforeEach(async () => {
  vi.resetModules();
  browser = installBrowser();
  prefs = await import('../src/lib/prefs.ts');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('prefs', () => {
  it('stores the theme and stamps it on the document, or clears both for system', () => {
    expect(prefs.readTheme()).toBe('system');
    prefs.writeTheme('dark');
    expect(prefs.readTheme()).toBe('dark');
    expect(browser.attributes.get('data-theme')).toBe('dark');
    expect(browser.storage.getItem('owl.theme')).toBe('"dark"');
    prefs.writeTheme('system');
    expect(prefs.readTheme()).toBe('system');
    expect(browser.attributes.has('data-theme')).toBe(false);
  });

  it('remembers the language', () => {
    expect(prefs.readLanguage()).toBeNull();
    prefs.writeLanguage('de');
    expect(prefs.readLanguage()).toBe('de');
    prefs.writeLanguage('es');
    expect(prefs.readLanguage()).toBe('es');
    prefs.writeLanguage('fr');
    expect(prefs.readLanguage()).toBe('fr');
    prefs.writeLanguage('pt');
    expect(prefs.readLanguage()).toBe('pt');
    prefs.writeLanguage('it');
    expect(prefs.readLanguage()).toBe('it');
    prefs.writeLanguage('ja');
    expect(prefs.readLanguage()).toBe('ja');
    prefs.writeLanguage('nl');
    expect(prefs.readLanguage()).toBe('nl');
  });

  it('keeps one session per event and ignores a malformed one', () => {
    prefs.writeSession(ID, { participantId: OTHER, token: 't' });
    expect(prefs.readSession(ID)).toEqual({
      participantId: OTHER,
      token: 't',
    });
    expect(prefs.readSession(OTHER)).toBeNull();
    browser.storage.setItem(
      `owl.session.${OTHER}`,
      '{"participantId":"bad","token":"t","name":"x"}'
    );
    expect(prefs.readSession(OTHER)).toBeNull();
    prefs.clearSession(ID);
    expect(prefs.readSession(ID)).toBeNull();
  });

  it('stores a session, replaces it, and forgets it for null', () => {
    prefs.storeSession(ID, { participantId: OTHER, token: 'a' });
    expect(prefs.readSession(ID)).toEqual({ participantId: OTHER, token: 'a' });
    prefs.storeSession(ID, { participantId: OTHER, token: 'b' });
    expect(prefs.readSession(ID)?.token).toBe('b');
    prefs.storeSession(ID, null);
    expect(prefs.readSession(ID)).toBeNull();
    expect(browser.storage.getItem(`owl.session.${ID}`)).toBeNull();
    // Nothing stored, nothing to forget: no error, no entry.
    expect(() => prefs.storeSession(OTHER, null)).not.toThrow();
    expect(prefs.readSession(OTHER)).toBeNull();
  });

  it('keeps the organiser key, refusing implausible ones', () => {
    prefs.writeAdminToken(ID, 'k'.repeat(43));
    expect(prefs.readAdminToken(ID)).toBe('k'.repeat(43));
    prefs.writeAdminToken(OTHER, 'short');
    expect(prefs.readAdminToken(OTHER)).toBeNull();
  });

  it('lists events newest first, keeps an organiser an organiser, and caps the list', () => {
    prefs.rememberEvent({ id: ID, title: 'A', emoji: 'owl' }, 'organiser');
    prefs.rememberEvent(
      { id: OTHER, title: 'B', emoji: 'soccer' },
      'participant'
    );
    prefs.rememberEvent({ id: ID, title: 'A2', emoji: 'owl' }, 'participant');
    expect(prefs.readMyEvents().map((e) => [e.id, e.title, e.role])).toEqual([
      [ID, 'A2', 'organiser'],
      [OTHER, 'B', 'participant'],
    ]);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const ids = Array.from(
      { length: 60 },
      (_, i) =>
        `${'1'.repeat(10)}${alphabet[i % 24]}${alphabet[Math.floor(i / 24)]}`
    );
    ids.forEach((id) =>
      prefs.rememberEvent({ id, title: id, emoji: 'owl' }, 'participant')
    );
    expect(prefs.readMyEvents()).toHaveLength(50);
  });

  it('drops a damaged entry and keeps the rest', () => {
    prefs.rememberEvent({ id: ID, title: 'A', emoji: 'owl' }, 'organiser');
    const stored = JSON.parse(
      browser.storage.getItem('owl.events')!
    ) as unknown[];
    browser.storage.setItem(
      'owl.events',
      JSON.stringify([{ id: 'bad' }, ...stored])
    );
    expect(prefs.readMyEvents().map((e) => e.id)).toEqual([ID]);
  });

  it('forgets an event with its session and key', () => {
    prefs.rememberEvent({ id: ID, title: 'A', emoji: 'owl' }, 'organiser');
    prefs.writeSession(ID, { participantId: OTHER, token: 't' });
    prefs.writeAdminToken(ID, 'k'.repeat(43));
    prefs.forgetEvent(ID);
    expect(prefs.readMyEvents()).toEqual([]);
    expect(prefs.readSession(ID)).toBeNull();
    expect(prefs.readAdminToken(ID)).toBeNull();
  });

  describe('the cap on the list', () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const idAt = (i: number) =>
      `${'1'.repeat(10)}${alphabet[i % 24]}${alphabet[Math.floor(i / 24)]}`;
    const remember = (
      i: number,
      role: 'organiser' | 'participant' = 'participant'
    ) => {
      const id = idAt(i);
      prefs.rememberEvent({ id, title: id, emoji: 'owl' }, role);
      prefs.writeSession(id, { participantId: OTHER, token: 't' });
      prefs.writeAdminToken(id, 'k'.repeat(43));
      return id;
    };

    it('removes the session and key of the entry that falls off the end, and only that', () => {
      const ids = Array.from({ length: 51 }, (_, i) => remember(i));
      const kept = prefs.readMyEvents().map((e) => e.id);
      expect(kept).toHaveLength(50);
      expect(kept).not.toContain(ids[0]);
      expect(prefs.readSession(ids[0]!)).toBeNull();
      expect(prefs.readAdminToken(ids[0]!)).toBeNull();
      expect(browser.storage.getItem(`owl.session.${ids[0]}`)).toBeNull();
      for (const id of ids.slice(1)) {
        expect(prefs.readSession(id), id).not.toBeNull();
        expect(prefs.readAdminToken(id), id).not.toBeNull();
      }
    });

    it('removes nothing at exactly fifty entries', () => {
      const ids = Array.from({ length: 50 }, (_, i) => remember(i));
      expect(prefs.readMyEvents()).toHaveLength(50);
      for (const id of ids) {
        expect(prefs.readSession(id), id).not.toBeNull();
        expect(prefs.readAdminToken(id), id).not.toBeNull();
      }
    });

    it('removes nothing when the same event is remembered again at the cap', () => {
      const ids = Array.from({ length: 50 }, (_, i) => remember(i));
      prefs.rememberEvent(
        { id: ids[0]!, title: 'again', emoji: 'owl' },
        'participant'
      );
      expect(prefs.readMyEvents()).toHaveLength(50);
      expect(prefs.readMyEvents()[0]!.id).toBe(ids[0]);
      for (const id of ids) expect(prefs.readSession(id), id).not.toBeNull();
    });

    it('clears the keys of every entry that falls off, when several do at once', () => {
      const ids = Array.from({ length: 50 }, (_, i) => remember(i));
      // Two more entries than the cap, written past the list's own limit.
      const stored = JSON.parse(browser.storage.getItem('owl.events')!) as {
        id: string;
      }[];
      const extra = [idAt(60), idAt(61)];
      for (const id of extra) {
        prefs.writeSession(id, { participantId: OTHER, token: 't' });
        stored.push({
          id,
          title: id,
          emoji: 'owl',
          role: 'participant',
        } as never);
      }
      browser.storage.setItem('owl.events', JSON.stringify(stored));
      remember(70);
      // The oldest of the listed entries goes with them; the rest stay.
      for (const id of [...extra, ids[0]!])
        expect(prefs.readSession(id), id).toBeNull();
      expect(prefs.readSession(ids[1]!)).not.toBeNull();
    });

    it('forgets an event that is not stored without a fuss', () => {
      expect(() => prefs.forgetEvent(ID)).not.toThrow();
      expect(prefs.readMyEvents()).toEqual([]);
    });

    it('leaves the other events alone when one is forgotten', () => {
      const a = remember(0);
      const b = remember(1);
      prefs.forgetEvent(a);
      expect(prefs.readMyEvents().map((e) => e.id)).toEqual([b]);
      expect(prefs.readSession(b)).not.toBeNull();
      expect(prefs.readAdminToken(a)).toBeNull();
    });
  });
});
