import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBrowser } from './browser.ts';

const ID = '7gT4kPq2Wx9Z';
const OTHER = 'Kd8mQ3vNp2Ra';
const KEY = 'k'.repeat(43);
const NEW_KEY = 'n'.repeat(43);

let browser: ReturnType<typeof installBrowser>;
let adminKey: typeof import('../src/lib/adminKey.ts');
let prefs: typeof import('../src/lib/prefs.ts');

beforeEach(async () => {
  vi.resetModules();
  browser = installBrowser();
  // The fake keeps the fragment on replaceState; a real one drops it.
  browser.window.history.replaceState = (state, _title, path) => {
    browser.window.history.state = state;
    browser.window.location.pathname = path;
    browser.window.location.hash = '';
  };
  prefs = await import('../src/lib/prefs.ts');
  adminKey = await import('../src/lib/adminKey.ts');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('takeAdminTokenFromFragment', () => {
  it('ignores an address without a key and leaves it alone', () => {
    browser.window.location.hash = '#other';
    expect(adminKey.takeAdminTokenFromFragment(ID)).toBeNull();
    expect(browser.window.location.hash).toBe('#other');
    browser.window.location.hash = '';
    expect(adminKey.takeAdminTokenFromFragment(ID)).toBeNull();
  });

  it('stores a first key and strips the fragment', () => {
    browser.window.location.hash = `#admin=${KEY}`;
    expect(adminKey.takeAdminTokenFromFragment(ID)).toBeNull();
    expect(prefs.readAdminToken(ID)).toBe(KEY);
    expect(browser.window.location.hash).toBe('');
  });

  it('strips but ignores a key that is too short or too long', () => {
    for (const bad of ['k'.repeat(19), 'k'.repeat(129), 'k'.repeat(30) + '!']) {
      browser.window.location.hash = `#admin=${bad}`;
      expect(adminKey.takeAdminTokenFromFragment(ID)).toBeNull();
      expect(browser.window.location.hash).toBe('');
    }
    expect(prefs.readAdminToken(ID)).toBeNull();
  });

  it('takes a key of exactly twenty and of 128 characters', () => {
    browser.window.location.hash = `#admin=${'a'.repeat(20)}`;
    adminKey.takeAdminTokenFromFragment(ID);
    expect(prefs.readAdminToken(ID)).toBe('a'.repeat(20));
    browser.window.location.hash = `#admin=${'b'.repeat(128)}`;
    adminKey.takeAdminTokenFromFragment(OTHER);
    expect(prefs.readAdminToken(OTHER)).toBe('b'.repeat(128));
  });

  it('does nothing for the key that is already stored, however often it comes', () => {
    prefs.writeAdminToken(ID, KEY);
    for (let i = 0; i < 2; i++) {
      browser.window.location.hash = `#admin=${KEY}`;
      expect(adminKey.takeAdminTokenFromFragment(ID)).toBeNull();
      expect(browser.window.location.hash).toBe('');
    }
    expect(prefs.readAdminToken(ID)).toBe(KEY);
  });

  it('hands a different key back to be checked instead of replacing the stored one', () => {
    prefs.writeAdminToken(ID, KEY);
    browser.window.location.hash = `#admin=${NEW_KEY}`;
    expect(adminKey.takeAdminTokenFromFragment(ID)).toBe(NEW_KEY);
    expect(prefs.readAdminToken(ID)).toBe(KEY);
    expect(browser.window.location.hash).toBe('');
  });
});

describe('clearAdminToken', () => {
  it('removes the key and the organiser label, and keeps entry and session', () => {
    prefs.writeAdminToken(ID, KEY);
    prefs.writeSession(ID, { participantId: OTHER, token: 't' });
    prefs.rememberEvent({ id: ID, title: 'A', emoji: 'owl' }, 'organiser');
    adminKey.clearAdminToken(ID);
    expect(prefs.readAdminToken(ID)).toBeNull();
    expect(prefs.readSession(ID)).not.toBeNull();
    expect(prefs.readMyEvents().map((e) => [e.id, e.role])).toEqual([
      [ID, 'participant'],
    ]);
    // The label does not come back with the next visit.
    prefs.rememberEvent({ id: ID, title: 'A', emoji: 'owl' }, 'participant');
    expect(prefs.readMyEvents()[0]!.role).toBe('participant');
  });

  it('is a no-op for an absent key and an event that is not listed', () => {
    prefs.rememberEvent({ id: OTHER, title: 'B', emoji: 'owl' }, 'participant');
    const before = browser.storage.getItem('owl.events');
    adminKey.clearAdminToken(ID);
    adminKey.clearAdminToken(OTHER);
    expect(browser.storage.getItem('owl.events')).toBe(before);
    expect(prefs.readAdminToken(ID)).toBeNull();
  });

  it('leaves the other events alone', () => {
    prefs.writeAdminToken(OTHER, KEY);
    prefs.rememberEvent({ id: OTHER, title: 'B', emoji: 'owl' }, 'organiser');
    prefs.rememberEvent({ id: ID, title: 'A', emoji: 'owl' }, 'organiser');
    adminKey.clearAdminToken(ID);
    expect(prefs.readAdminToken(OTHER)).toBe(KEY);
    expect(prefs.readMyEvents().map((e) => [e.id, e.role])).toEqual([
      [ID, 'participant'],
      [OTHER, 'organiser'],
    ]);
  });
});
