import { afterEach, describe, expect, it, vi } from 'vitest';
import { de } from '../src/i18n/de.ts';
import { en } from '../src/i18n/en.ts';
import { es } from '../src/i18n/es.ts';
import { fr } from '../src/i18n/fr.ts';
import { it as italian } from '../src/i18n/it.ts';
import { ja } from '../src/i18n/ja.ts';
import { nl } from '../src/i18n/nl.ts';
import { pt } from '../src/i18n/pt.ts';
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
  it('has every English text in each translation, with the same placeholders', () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const dictionary of [de, es, fr, italian, ja, nl, pt]) {
      expect(Object.keys(dictionary).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(placeholders(dictionary[key]), key).toEqual(
          placeholders(en[key])
        );
        expect(dictionary[key].trim(), key).not.toBe('');
      }
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
    expect(translator('es').tn('create.dayCount', 1)).toBe('1 día para elegir');
    expect(translator('es').tn('create.dayCount', 0)).toBe(
      '0 días para elegir'
    );
    expect(translator('fr').tn('create.dayCount', 1)).toBe('1 jour au choix');
    expect(translator('fr').tn('create.dayCount', 0)).toBe('0 jour au choix');
    expect(translator('pt').tn('create.dayCount', 1)).toBe('1 dia à escolha');
    expect(translator('pt').tn('create.dayCount', 0)).toBe('0 dias à escolha');
    expect(translator('it').tn('create.dayCount', 1)).toBe(
      '1 giorno tra cui scegliere'
    );
    expect(translator('it').tn('create.dayCount', 0)).toBe(
      '0 giorni tra cui scegliere'
    );
    expect(translator('ja').tn('create.dayCount', 0)).toBe('候補は0日');
    expect(translator('ja').tn('create.dayCount', 1)).toBe('候補は1日');
    expect(translator('ja').tn('create.dayCount', 2)).toBe('候補は2日');
    expect(translator('nl').tn('create.dayCount', 0)).toBe(
      '0 dagen om uit te kiezen'
    );
    expect(translator('nl').tn('create.dayCount', 1)).toBe(
      '1 dag om uit te kiezen'
    );
    expect(translator('nl').tn('create.dayCount', 2)).toBe(
      '2 dagen om uit te kiezen'
    );
  });

  it('starts in the language of the address before anything else', () => {
    expect(detectLanguage('de', ['en-US'], 'fr')).toBe('fr');
    expect(detectLanguage(null, ['es-ES'], 'ja')).toBe('ja');
    expect(detectLanguage(null, [], 'nl')).toBe('nl');
    expect(detectLanguage('de', ['en-US'], null)).toBe('de');
  });

  it('starts in the stored language, else the browser’s, else English', () => {
    expect(detectLanguage('de', ['en-US'])).toBe('de');
    expect(detectLanguage('es', ['en-US'])).toBe('es');
    expect(detectLanguage(null, ['es-ES', 'en-GB'])).toBe('es');
    expect(detectLanguage('fr', ['en-US'])).toBe('fr');
    expect(detectLanguage(null, ['fr-FR', 'en-GB'])).toBe('fr');
    expect(detectLanguage('pt', ['en-US'])).toBe('pt');
    expect(detectLanguage(null, ['pt-PT', 'en-GB'])).toBe('pt');
    expect(detectLanguage('it', ['en-US'])).toBe('it');
    expect(detectLanguage(null, ['it-IT', 'de-AT', 'en'])).toBe('it');
    expect(detectLanguage('ja', ['en-US'])).toBe('ja');
    expect(detectLanguage(null, ['ja-JP', 'en-GB'])).toBe('ja');
    expect(detectLanguage('nl', ['en-US'])).toBe('nl');
    expect(detectLanguage(null, ['nl-NL', 'en-GB'])).toBe('nl');
    expect(detectLanguage(null, ['EN-gb'])).toBe('en');
    expect(detectLanguage(null, ['no', 'da'])).toBe('en');
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

  it('reads the start page in a language from its address', () => {
    expect(parseRoute('/de')).toEqual({ page: 'home', language: 'de' });
    expect(parseRoute('/ja/')).toEqual({ page: 'home', language: 'ja' });
    for (const language of ['en', 'es', 'fr', 'it', 'nl', 'pt'] as const)
      expect(parseRoute(`/${language}`)).toEqual({ page: 'home', language });
  });

  it('refuses malformed event ids and unknown paths', () => {
    for (const path of [
      '/e/short',
      '/e/0OIl00000000',
      '/e/7gT4kPq2Wx9Z/x',
      '/nope',
      '/xx',
      '/no',
      '/DE',
      '/de/privacy',
      '/deu',
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
