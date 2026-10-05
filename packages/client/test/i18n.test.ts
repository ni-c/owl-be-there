import { LANGUAGES, LOCALES, PEOPLE } from '@owl/shared';
import { describe, expect, it } from 'vitest';
import { de } from '../src/i18n/de.ts';
import { en } from '../src/i18n/en.ts';
import { es } from '../src/i18n/es.ts';
import { fr } from '../src/i18n/fr.ts';
import { interpolate } from '../src/i18n/index.tsx';
import { it as italian } from '../src/i18n/it.ts';
import { ja } from '../src/i18n/ja.ts';
import { nl } from '../src/i18n/nl.ts';
import { pt } from '../src/i18n/pt.ts';

const DICTIONARIES = { de, en, es, fr, it: italian, ja, nl, pt } as const;

describe('interpolate', () => {
  it('leaves placeholders named like Object.prototype members visible', () => {
    expect(
      interpolate('{toString} {constructor} {__proto__} {missing}', {})
    ).toBe('{toString} {constructor} {__proto__} {missing}');
    expect(interpolate('{valueOf} {hasOwnProperty}', { other: 1 })).toBe(
      '{valueOf} {hasOwnProperty}'
    );
  });

  it('fills what is given, a zero and an empty string included', () => {
    expect(interpolate('{name}', { name: 'x' })).toBe('x');
    expect(interpolate('{n} of {m}', { n: 0, m: '' })).toBe('0 of ');
  });

  it('takes a parameter that is called like a prototype member', () => {
    expect(interpolate('{constructor}', { constructor: 'ok' })).toBe('ok');
  });
});

describe('texts that must agree with the rest of the app', () => {
  it('has a language for every dictionary and the other way round', () => {
    expect(Object.keys(DICTIONARIES).sort()).toEqual([...LANGUAGES].sort());
  });

  it('names a weekday in every language, and never says “Tutti i” in Italian', () => {
    for (const language of LANGUAGES) {
      const format = new Intl.DateTimeFormat(LOCALES[language], {
        weekday: 'long',
        timeZone: 'UTC',
      });
      for (let day = 1; day <= 7; day += 1) {
        // 2027-03-01 is a Monday.
        const weekday = format.format(Date.UTC(2027, 2, day));
        const text = interpolate(DICTIONARIES[language]['cal.weekdayAll'], {
          weekday,
        });
        expect(text, `${language} ${weekday}`).toContain(weekday);
        if (language === 'it') {
          expect(text).toBe(`Ogni ${weekday}`);
          expect(text.startsWith('Tutti i')).toBe(false);
        }
      }
    }
  });

  it('mentions the one request to a third party in every language', () => {
    for (const language of LANGUAGES) {
      const dictionary = DICTIONARIES[language];
      expect(dictionary['privacy.stored.nothingElse'], language).toContain(
        language === 'ja' ? 'Google' : dictionary['event.google']
      );
    }
  });

  it('names the example’s first person as the start page shows her', () => {
    const name = PEOPLE[0]!.name;
    for (const language of LANGUAGES) {
      expect(DICTIONARIES[language]['home.example.text'], language).toContain(
        name
      );
    }
  });

  it('calls a poll the same in German on every button and banner', () => {
    expect(de['admin.close']).toContain('Abstimmung');
    expect(de['admin.reopen']).toContain('Abstimmung');
    expect(de['event.closed']).toContain('Abstimmung');
    expect(de['who.closed']).toContain('Abstimmung');
    expect(de['mine.closed']).toContain('Abstimmung');
    expect(de['admin.close']).not.toContain('Umfrage');
    expect(de['admin.reopen']).not.toContain('Umfrage');
  });

  it('says Abstimmung, never Umfrage, anywhere in German', () => {
    for (const [key, text] of Object.entries(de))
      expect(text, key).not.toContain('Umfrage');
    expect(de['home.forgetOrganiser.text']).toContain('Abstimmung');
  });

  it('says 予定, never イベント, anywhere in Japanese', () => {
    for (const [key, text] of Object.entries(ja))
      expect(text, key).not.toContain('イベント');
    expect(ja['home.forgetOrganiser.title']).toContain('予定');
  });

  it('calls an event 予定 in the Japanese texts that used to say イベント', () => {
    for (const key of [
      'home.example.hint',
      'home.faq.account.a',
      'home.faq.doodle.a',
      'event.planOwn.text',
      'event.expires',
    ] as const)
      expect(ja[key], key).not.toContain('イベント');
    expect(ja['event.expires']).toContain('予定');
  });

  it('keeps the English privacy line about third parties true', () => {
    expect(en['privacy.stored.nothingElse']).toContain('Google Calendar');
  });
});
