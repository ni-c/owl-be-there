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
  });

  it('keeps one session per event and ignores a malformed one', () => {
    prefs.writeSession(ID, { participantId: OTHER, token: 't', name: 'Max' });
    expect(prefs.readSession(ID)).toEqual({
      participantId: OTHER,
      token: 't',
      name: 'Max',
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

  it('keeps the organiser key, refusing implausible ones', () => {
    prefs.writeAdminToken(ID, 'k'.repeat(43));
    expect(prefs.readAdminToken(ID)).toBe('k'.repeat(43));
    prefs.writeAdminToken(OTHER, 'short');
    expect(prefs.readAdminToken(OTHER)).toBeNull();
  });

  it('lists events newest first, keeps an organiser an organiser, and caps the list', () => {
    prefs.rememberEvent({ id: ID, title: 'A', emoji: 'owl' }, 'organiser', 1);
    prefs.rememberEvent(
      { id: OTHER, title: 'B', emoji: 'soccer' },
      'participant',
      2
    );
    prefs.rememberEvent(
      { id: ID, title: 'A2', emoji: 'owl' },
      'participant',
      3
    );
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
    ids.forEach((id, i) =>
      prefs.rememberEvent(
        { id, title: id, emoji: 'owl' },
        'participant',
        10 + i
      )
    );
    expect(prefs.readMyEvents()).toHaveLength(50);
  });

  it('drops a damaged entry and keeps the rest', () => {
    prefs.rememberEvent({ id: ID, title: 'A', emoji: 'owl' }, 'organiser', 1);
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
    prefs.writeSession(ID, { participantId: OTHER, token: 't', name: 'Max' });
    prefs.writeAdminToken(ID, 'k'.repeat(43));
    prefs.forgetEvent(ID);
    expect(prefs.readMyEvents()).toEqual([]);
    expect(prefs.readSession(ID)).toBeNull();
    expect(prefs.readAdminToken(ID)).toBeNull();
  });
});
