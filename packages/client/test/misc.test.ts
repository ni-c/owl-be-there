import { afterEach, describe, expect, it, vi } from 'vitest';
import { de } from '../src/i18n/de.ts';
import { en } from '../src/i18n/en.ts';
import { detectLanguage, interpolate, translator } from '../src/i18n/index.tsx';
import { ApiFailure, NetworkFailure } from '../src/lib/api.ts';
import { errorMessage } from '../src/lib/errors.ts';
import { firstWeekdayFor } from '../src/lib/locale.ts';
import { navigate, parseRoute, subscribeToRoute } from '../src/lib/route.ts';
import { installBrowser } from './browser.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('i18n', () => {
  it('has every English text in German, with the same placeholders', () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(de[key]), key).toEqual(placeholders(en[key]));
      expect(de[key].trim(), key).not.toBe('');
    }
  });

  it('fills placeholders and leaves unknown ones visible', () => {
    expect(interpolate('Hi {name}, {missing}', { name: 'Max' })).toBe(
      'Hi Max, {missing}'
    );
    expect(interpolate('plain')).toBe('plain');
  });

  it('picks the plural form by language', () => {
    expect(translator('en').tn('create.dayCount', 1)).toBe(
      '1 day to choose from'
    );
    expect(translator('en').tn('create.dayCount', 0)).toBe(
      '0 days to choose from'
    );
    expect(translator('de').tn('create.dayCount', 2)).toBe(
      '2 Tage zur Auswahl'
    );
    expect(translator('de').t('mine.hello', { name: 'Anna' })).toBe(
      'Hallo Anna!'
    );
  });

  it('starts in the stored language, else the browser’s, else English', () => {
    expect(detectLanguage('de', ['en-US'])).toBe('de');
    expect(detectLanguage(null, ['fr-FR', 'de-AT', 'en'])).toBe('de');
    expect(detectLanguage(null, ['EN-gb'])).toBe('en');
    expect(detectLanguage(null, ['fr', 'it'])).toBe('en');
    expect(detectLanguage(null, [])).toBe('en');
  });
});

describe('errorMessage', () => {
  const t = (key: string) => key;
  it('names what went wrong for the reader', () => {
    expect(errorMessage(new NetworkFailure(new Error('x')), t)).toBe(
      'error.offline'
    );
    expect(errorMessage(new ApiFailure(429, 'rate_limited', '', null), t)).toBe(
      'error.rateLimited'
    );
    expect(errorMessage(new ApiFailure(409, 'name_taken', '', null), t)).toBe(
      'error.nameTaken'
    );
    expect(errorMessage(new ApiFailure(500, 'internal', '', null), t)).toBe(
      'error.generic'
    );
    expect(errorMessage(new Error('boom'), t)).toBe('error.generic');
  });
});

describe('firstWeekdayFor', () => {
  it('starts on Monday in Germany and the UK, on Sunday in the US where the browser knows', () => {
    expect(firstWeekdayFor('de-DE')).toBe(0);
    expect(firstWeekdayFor('en-GB')).toBe(0);
    expect([0, 6]).toContain(firstWeekdayFor('en-US'));
  });

  it('falls back to Monday for a tag it cannot read', () => {
    expect(firstWeekdayFor('not a tag!')).toBe(0);
  });
});

describe('routes', () => {
  it('knows the four pages', () => {
    expect(parseRoute('/')).toEqual({ page: 'home' });
    expect(parseRoute('')).toEqual({ page: 'home' });
    expect(parseRoute('/privacy')).toEqual({ page: 'privacy' });
    expect(parseRoute('/e/7gT4kPq2Wx9Z')).toEqual({
      page: 'event',
      id: '7gT4kPq2Wx9Z',
    });
    expect(parseRoute('/e/7gT4kPq2Wx9Z/')).toEqual({
      page: 'event',
      id: '7gT4kPq2Wx9Z',
    });
  });

  it('refuses malformed event ids and unknown paths', () => {
    for (const path of [
      '/e/short',
      '/e/0OIl00000000',
      '/e/7gT4kPq2Wx9Z/x',
      '/nope',
    ]) {
      expect(parseRoute(path), path).toEqual({ page: 'not-found' });
    }
  });

  it('navigates with history, optionally replacing and carrying state', () => {
    const { window } = installBrowser();
    navigate('/privacy');
    expect(window.location.pathname).toBe('/privacy');
    navigate('/e/7gT4kPq2Wx9Z', { replace: true, state: { created: true } });
    expect(window.history.state).toEqual({ created: true });
    expect(window.scrollTo).toHaveBeenCalledTimes(2);
  });

  it('tells subscribers about navigation and the back button until they leave', () => {
    const { window } = installBrowser();
    let calls = 0;
    const unsubscribe = subscribeToRoute(() => (calls += 1));
    navigate('/privacy');
    window.dispatch('popstate');
    unsubscribe();
    navigate('/');
    window.dispatch('popstate');
    expect(calls).toBe(2);
  });
});
