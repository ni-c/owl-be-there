import { charCount, LANGUAGES, LIMITS, LOCALES, PEOPLE } from '@owl/shared';
import { describe, expect, it } from 'vitest';
import { ar, arForms } from '../src/i18n/ar.ts';
import { cs, csFew } from '../src/i18n/cs.ts';
import { de } from '../src/i18n/de.ts';
import { en } from '../src/i18n/en.ts';
import { es } from '../src/i18n/es.ts';
import { es419 } from '../src/i18n/es-419.ts';
import { fa } from '../src/i18n/fa.ts';
import { fi } from '../src/i18n/fi.ts';
import { fr } from '../src/i18n/fr.ts';
import { id } from '../src/i18n/id.ts';
import { dictionaries } from '../src/i18n/dictionaries.ts';
import { interpolate, translator } from '../src/i18n/index.tsx';
import { it as italian } from '../src/i18n/it.ts';
import { ja } from '../src/i18n/ja.ts';
import { ko } from '../src/i18n/ko.ts';
import { nb } from '../src/i18n/nb.ts';
import { nl } from '../src/i18n/nl.ts';
import { pl } from '../src/i18n/pl.ts';
import { pt } from '../src/i18n/pt.ts';
import { ptBr } from '../src/i18n/pt-BR.ts';
import { ru } from '../src/i18n/ru.ts';
import { sv } from '../src/i18n/sv.ts';
import { tr } from '../src/i18n/tr.ts';
import { uk } from '../src/i18n/uk.ts';
import { ur } from '../src/i18n/ur.ts';
import { vi } from '../src/i18n/vi.ts';
import { zhHans } from '../src/i18n/zh-Hans.ts';
import { zhHant } from '../src/i18n/zh-Hant.ts';

const DICTIONARIES = {
  ar,
  cs,
  de,
  en,
  es,
  'es-419': es419,
  fa,
  fi,
  fr,
  id,
  it: italian,
  ja,
  ko,
  nb,
  nl,
  pl,
  pt,
  'pt-BR': ptBr,
  ru,
  sv,
  tr,
  uk,
  ur,
  vi,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
} as const;

describe('dictionaries, loaded when needed', () => {
  it('ships English and German, and loads the rest as their own modules', async () => {
    expect(dictionaries.peek('en')?.texts).toBe(en);
    expect(dictionaries.peek('de')?.texts).toBe(de);
    expect(dictionaries.peek('fa')).toBeUndefined();
    expect(() => translator('fa')).toThrow('The fa texts are not loaded');
    for (const language of LANGUAGES) {
      const pack = await dictionaries.load(language);
      expect(pack.texts, language).toBe(DICTIONARIES[language]);
    }
    expect(translator('fa').t('footer.language')).toBe(fa['footer.language']);
  });

  it('brings each language’s own plural forms along', async () => {
    expect((await dictionaries.load('cs')).forms).toEqual({ few: csFew });
    expect((await dictionaries.load('ar')).forms).toBe(arForms);
    expect((await dictionaries.load('fr')).forms).toBeUndefined();
  });
});

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
        language === 'ja' || language === 'pl'
          ? 'Google'
          : dictionary['event.google']
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

  it('gives the example’s two notes in every language, within a note’s length', () => {
    for (const language of LANGUAGES) {
      for (const key of [
        'home.example.noteBen',
        'home.example.noteMax',
      ] as const) {
        const text = DICTIONARIES[language][key];
        expect(text.trim(), `${language} ${key}`).not.toBe('');
        expect(charCount(text), `${language} ${key}`).toBeLessThanOrEqual(
          LIMITS.note
        );
        if (language !== 'en')
          expect(text, `${language} ${key}`).not.toBe(en[key]);
      }
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

  it('keeps the {days} placeholder in the retention text of every language', () => {
    for (const language of LANGUAGES) {
      const text = DICTIONARIES[language]['privacy.retention.text'];
      expect(text, language).toContain('{days}');
      // The one placeholder is filled with RETENTION_DAYS; no number is typed out.
      expect(text.match(/\d+/g), language).toBeNull();
      expect(interpolate(text, { days: 90 }), language).toContain('90');
    }
  });

  it('says in English that the wait for the last day applies once somebody has answered', () => {
    expect(en['privacy.retention.text']).toContain(
      'Once somebody has answered, it stays at least until its final day has passed.'
    );
  });

  it('keeps the English privacy line about third parties true', () => {
    expect(en['privacy.stored.nothingElse']).toContain('Google Calendar');
  });
});
