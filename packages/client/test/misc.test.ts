import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
import { it as italian } from '../src/i18n/it.ts';
import { ja } from '../src/i18n/ja.ts';
import { ko } from '../src/i18n/ko.ts';
import { nb } from '../src/i18n/nb.ts';
import { nl } from '../src/i18n/nl.ts';
import { pl, plFew } from '../src/i18n/pl.ts';
import { pt } from '../src/i18n/pt.ts';
import { ptBr } from '../src/i18n/pt-BR.ts';
import { ru, ruFew } from '../src/i18n/ru.ts';
import { sv } from '../src/i18n/sv.ts';
import { tr } from '../src/i18n/tr.ts';
import { uk, ukFew } from '../src/i18n/uk.ts';
import { ur } from '../src/i18n/ur.ts';
import { vi as vietnamese } from '../src/i18n/vi.ts';
import { zhHans } from '../src/i18n/zh-Hans.ts';
import { zhHant } from '../src/i18n/zh-Hant.ts';
import { preloadAllDictionaries } from '../src/i18n/dictionaries.ts';
import { detectLanguage, interpolate, translator } from '../src/i18n/index.tsx';
import { ApiFailure, NetworkFailure } from '../src/lib/api.ts';
import { errorMessage } from '../src/lib/errors.ts';
import {
  firstWeekdayFor,
  longWeekdayHeadings,
  weekdayHeading,
  weekdayName,
  weekdayOrder,
} from '../src/lib/locale.ts';
import {
  headingKey,
  navigate,
  parseRoute,
  placeOf,
  subscribeToRoute,
} from '../src/lib/route.ts';
import { installBrowser } from './browser.ts';

// translator() needs a language's texts loaded; here, every language.
beforeAll(preloadAllDictionaries);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('i18n', () => {
  it('has every English text in each translation, with the same placeholders', () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const dictionary of [
      ar,
      cs,
      de,
      es,
      es419,
      fa,
      fi,
      fr,
      id,
      italian,
      ja,
      ko,
      nb,
      nl,
      pl,
      pt,
      ptBr,
      ru,
      sv,
      tr,
      uk,
      ur,
      vietnamese,
      zhHans,
      zhHant,
    ]) {
      expect(Object.keys(dictionary).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(placeholders(dictionary[key]), key).toEqual(
          placeholders(en[key])
        );
        expect(dictionary[key].trim(), key).not.toBe('');
      }
    }
  });

  it("writes numbers in the language's own digits, without grouping", () => {
    expect(translator('fa').number(2026)).toBe('۲۰۲۶');
    expect(translator('fa').tn('create.dayCount', 23)).toContain('۲۳');
    expect(translator('fa').tn('create.dayCount', 23)).not.toMatch(/\d/);
    expect(translator('en').number(1000)).toBe('1000');
    expect(translator('de').number(0)).toBe('0');
    expect(translator('ar').number(12)).toBe('12');
    expect(translator('en').t('mine.hello', { name: 'Anna' })).toBe('Hi Anna!');
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
    for (const [count, expected] of [
      [0, '0 dager å velge mellom'],
      [1, '1 dag å velge mellom'],
      [2, '2 dager å velge mellom'],
      [5, '5 dager å velge mellom'],
    ] as const)
      expect(translator('nb').tn('create.dayCount', count)).toBe(expected);
    expect(translator('nb').tn('event.answers', 1)).toBe('1 svar');
    expect(translator('nb').tn('event.answers', 2)).toBe('2 svar');
    expect(translator('nb').tn('mine.newDays', 1)).toBe(
      '1 ny dag er lagt til. Ta en titt.'
    );
    expect(translator('nb').tn('mine.newDays', 2)).toBe(
      '2 nye dager er lagt til. Ta en titt.'
    );
    for (const [count, expected] of [
      [0, '0 dagar att välja mellan'],
      [1, '1 dag att välja mellan'],
      [2, '2 dagar att välja mellan'],
      [5, '5 dagar att välja mellan'],
    ] as const)
      expect(translator('sv').tn('create.dayCount', count)).toBe(expected);
    expect(translator('sv').tn('event.answers', 1)).toBe('1 svar');
    expect(translator('sv').tn('event.answers', 2)).toBe('2 svar');
    expect(translator('sv').tn('mine.newDays', 1)).toBe(
      '1 ny dag har lagts till. Ta en titt.'
    );
    expect(translator('sv').tn('mine.newDays', 2)).toBe(
      '2 nya dagar har lagts till. Ta en titt.'
    );
    for (const [count, expected] of [
      [0, '0 päivää valittavana'],
      [1, '1 päivä valittavana'],
      [2, '2 päivää valittavana'],
      [5, '5 päivää valittavana'],
    ] as const)
      expect(translator('fi').tn('create.dayCount', count)).toBe(expected);
    expect(translator('fi').tn('event.answers', 1)).toBe('1 vastaus');
    expect(translator('fi').tn('event.answers', 2)).toBe('2 vastausta');
    expect(translator('fi').tn('event.minCount', 1)).toBe(
      'tarvitaan 1 henkilö'
    );
    expect(translator('fi').tn('event.minCount', 5)).toBe(
      'tarvitaan 5 henkilöä'
    );
    expect(translator('fi').tn('cal.othersCan', 1)).toBe(
      'lisäksi 1 muu henkilö pääsee'
    );
    expect(translator('fi').tn('cal.othersCan', 2)).toBe(
      'lisäksi 2 muuta henkilöä pääsee'
    );
    expect(translator('fi').tn('mine.newDays', 1)).toBe(
      '1 uusi päivä lisättiin. Tarkista se.'
    );
    expect(translator('fi').tn('mine.newDays', 2)).toBe(
      '2 uutta päivää lisättiin. Tarkista ne.'
    );
    expect(translator('pl').tn('event.minCount', 1)).toBe(
      'wymagana co najmniej 1 osoba'
    );
    expect(translator('pl').tn('event.minCount', 2)).toBe(
      'wymagane co najmniej 2 osoby'
    );
    expect(translator('pl').tn('event.minCount', 5)).toBe(
      'wymaganych co najmniej 5 osób'
    );
    expect(translator('pl').tn('event.minCount', 12)).toBe(
      'wymaganych co najmniej 12 osób'
    );
    expect(translator('pl').tn('event.minCount', 22)).toBe(
      'wymagane co najmniej 22 osoby'
    );
    expect(translator('pl').tn('mine.newDays', 0)).toBe(
      'Dodano 0 nowych dni. Sprawdź je.'
    );
    expect(translator('pl').tn('mine.newDays', 2)).toBe(
      'Dodano 2 nowe dni. Sprawdź je.'
    );
    expect(translator('pl').tn('cal.othersCan', 2)).toBe(
      'jeszcze 2 osoby mogą przyjść'
    );
    expect(translator('pl').tn('cal.othersCan', 5)).toBe(
      'jeszcze 5 osób może przyjść'
    );
    for (const [count, expected] of [
      [0, '0 dní na výběr'],
      [1, '1 den na výběr'],
      [2, '2 dny na výběr'],
      [4, '4 dny na výběr'],
      [5, '5 dní na výběr'],
      [12, '12 dní na výběr'],
      [22, '22 dní na výběr'],
    ] as const)
      expect(translator('cs').tn('create.dayCount', count)).toBe(expected);
    expect(translator('cs').tn('event.minCount', 2)).toBe('minimálně 2 lidé');
    expect(translator('cs').tn('event.answers', 4)).toBe('4 odpovědi');
    expect(translator('cs').tn('event.answers', 5)).toBe('5 odpovědí');
    expect(translator('cs').tn('mine.newDays', 2)).toBe(
      'Byly přidány 2 nové dny. Podívej se.'
    );
    expect(translator('cs').tn('privacy.backups', 2)).toContain('2 dny');
    for (const [count, expected] of [
      [0, '0 дней на выбор'],
      [1, '1 день на выбор'],
      [2, '2 дня на выбор'],
      [4, '4 дня на выбор'],
      [5, '5 дней на выбор'],
      [11, '11 дней на выбор'],
      [21, '21 день на выбор'],
      [22, '22 дня на выбор'],
      [25, '25 дней на выбор'],
    ] as const)
      expect(translator('ru').tn('create.dayCount', count)).toBe(expected);
    expect(translator('ru').tn('event.answers', 2)).toBe('2 ответа');
    expect(translator('ru').tn('event.answers', 5)).toBe('5 ответов');
    expect(translator('ru').tn('event.minCount', 21)).toBe(
      'нужен минимум 21 человек'
    );
    expect(translator('ru').tn('event.minCount', 22)).toBe(
      'нужно минимум 22 человека'
    );
    expect(translator('ru').tn('cal.othersCan', 2)).toBe(
      'ещё 2 человека могут прийти'
    );
    expect(translator('ru').tn('privacy.logs', 2)).toContain('через 2 дня');
    for (const [count, expected] of [
      [0, '0 днів на вибір'],
      [1, '1 день на вибір'],
      [2, '2 дні на вибір'],
      [4, '4 дні на вибір'],
      [5, '5 днів на вибір'],
      [11, '11 днів на вибір'],
      [21, '21 день на вибір'],
      [22, '22 дні на вибір'],
      [25, '25 днів на вибір'],
    ] as const)
      expect(translator('uk').tn('create.dayCount', count)).toBe(expected);
    expect(translator('uk').tn('event.answers', 2)).toBe('2 відповіді');
    expect(translator('uk').tn('event.answers', 5)).toBe('5 відповідей');
    expect(translator('uk').tn('event.minCount', 21)).toBe(
      'потрібна щонайменше 21 людина'
    );
    expect(translator('uk').tn('event.minCount', 22)).toBe(
      'потрібні щонайменше 22 людини'
    );
    for (const [count, expected] of [
      [0, 'لا أيام للاختيار (0)'],
      [1, 'يوم واحد للاختيار (1)'],
      [2, 'يومان للاختيار (2)'],
      [3, '3 أيام للاختيار'],
      [11, '11 يوماً للاختيار'],
      [21, '21 يوماً للاختيار'],
      [22, '22 يوماً للاختيار'],
      [100, '100 يوم للاختيار'],
    ] as const)
      expect(translator('ar').tn('create.dayCount', count)).toBe(expected);
    expect(translator('ar').tn('event.answers', 2)).toBe('إجابتان (2)');
    expect(translator('ar').tn('event.answers', 3)).toBe('3 إجابات');
    expect(translator('ar').tn('event.answers', 11)).toBe('11 إجابة');
    for (const forms of Object.values(arForms)) {
      expect(Object.keys(forms).sort()).toEqual(
        Object.keys(en)
          .filter((key) => key.endsWith('_other'))
          .map((key) => key.slice(0, -6))
          .sort()
      );
      for (const [key, value] of Object.entries(forms))
        expect(
          [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort(),
          key
        ).toEqual(
          [...en[`${key}_other` as keyof typeof en].matchAll(/\{(\w+)\}/g)]
            .map((match) => match[1])
            .sort()
        );
    }
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const [key, value] of Object.entries(plFew))
      expect(placeholders(value), key).toEqual(
        placeholders(en[`${key}_other` as keyof typeof en])
      );
    for (const [key, value] of Object.entries(csFew))
      expect(placeholders(value), key).toEqual(
        placeholders(en[`${key}_other` as keyof typeof en])
      );
    for (const [key, value] of Object.entries(ruFew))
      expect(placeholders(value), key).toEqual(
        placeholders(en[`${key}_other` as keyof typeof en])
      );
    for (const [key, value] of Object.entries(ukFew))
      expect(placeholders(value), key).toEqual(
        placeholders(en[`${key}_other` as keyof typeof en])
      );
    expect(translator('zh-Hant').tn('create.dayCount', 0)).toBe(
      '有 0 天可供選擇'
    );
    expect(translator('zh-Hant').tn('create.dayCount', 1)).toBe(
      '有 1 天可供選擇'
    );
    expect(translator('zh-Hans').tn('create.dayCount', 0)).toBe(
      '有 0 天可供选择'
    );
    expect(translator('zh-Hans').tn('create.dayCount', 1)).toBe(
      '有 1 天可供选择'
    );
    expect(translator('tr').tn('create.dayCount', 0)).toBe(
      'Seçilebilecek 0 gün'
    );
    expect(translator('tr').tn('create.dayCount', 1)).toBe(
      'Seçilebilecek 1 gün'
    );
    expect(translator('id').tn('create.dayCount', 0)).toBe(
      '0 hari untuk dipilih'
    );
    expect(translator('id').tn('create.dayCount', 1)).toBe(
      '1 hari untuk dipilih'
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
    expect(detectLanguage(null, ['id-ID', 'en-GB'])).toBe('id');
    expect(detectLanguage('pt', ['en-US'])).toBe('pt');
    expect(detectLanguage(null, ['pt-PT', 'en-GB'])).toBe('pt');
    expect(detectLanguage('it', ['en-US'])).toBe('it');
    expect(detectLanguage(null, ['it-IT', 'de-AT', 'en'])).toBe('it');
    expect(detectLanguage('ja', ['en-US'])).toBe('ja');
    expect(detectLanguage(null, ['ja-JP', 'en-GB'])).toBe('ja');
    expect(detectLanguage('nl', ['en-US'])).toBe('nl');
    expect(detectLanguage(null, ['nl-NL', 'en-GB'])).toBe('nl');
    expect(detectLanguage(null, ['nb-NO', 'en-GB'])).toBe('nb');
    expect(detectLanguage(null, ['sv-SE', 'en-GB'])).toBe('sv');
    expect(detectLanguage(null, ['fi-FI', 'en-GB'])).toBe('fi');
    expect(detectLanguage(null, ['tr-TR', 'en-GB'])).toBe('tr');
    expect(detectLanguage(null, ['no-NO', 'en-GB'])).toBe('nb');
    expect(detectLanguage(null, ['nn-NO', 'en-GB'])).toBe('en');
    expect(detectLanguage(null, ['pl-PL', 'en-GB'])).toBe('pl');
    expect(detectLanguage(null, ['cs-CZ', 'en-GB'])).toBe('cs');
    expect(detectLanguage(null, ['ru-RU', 'en-GB'])).toBe('ru');
    expect(detectLanguage(null, ['ar-EG', 'en-GB'])).toBe('ar');
    expect(detectLanguage(null, ['uk-UA', 'ru-RU'])).toBe('uk');
    expect(detectLanguage(null, ['vi-VN', 'en-GB'])).toBe('vi');
    expect(detectLanguage(null, ['ko-KR', 'en-GB'])).toBe('ko');
    expect(detectLanguage(null, ['ko'])).toBe('ko');
    expect(detectLanguage(null, ['pt-BR', 'en-GB'])).toBe('pt-BR');
    expect(detectLanguage(null, ['pt-br'])).toBe('pt-BR');
    expect(detectLanguage(null, ['pt-PT'])).toBe('pt');
    expect(detectLanguage(null, ['pt-AO'])).toBe('pt');
    expect(detectLanguage(null, ['pt'])).toBe('pt');
    expect(detectLanguage(null, ['es-MX', 'en-GB'])).toBe('es-419');
    expect(detectLanguage(null, ['es-419'])).toBe('es-419');
    expect(detectLanguage(null, ['es-US'])).toBe('es-419');
    expect(detectLanguage(null, ['es-ES'])).toBe('es');
    expect(detectLanguage(null, ['es'])).toBe('es');
    expect(detectLanguage(null, ['fa-IR', 'en-GB'])).toBe('fa');
    expect(detectLanguage(null, ['ur-PK', 'en-GB'])).toBe('ur');
    expect(detectLanguage(null, ['zh-TW', 'en-GB'])).toBe('zh-Hant');
    expect(detectLanguage(null, ['zh-Hant-HK'])).toBe('zh-Hant');
    expect(detectLanguage(null, ['zh-CN', 'en-GB'])).toBe('zh-Hans');
    expect(detectLanguage(null, ['zh-SG'])).toBe('zh-Hans');
    expect(detectLanguage(null, ['zh-Hans-CN'])).toBe('zh-Hans');
    expect(detectLanguage(null, ['zh'])).toBe('zh-Hans');
    expect(detectLanguage(null, ['zh-HK'])).toBe('zh-Hant');
    expect(detectLanguage(null, ['zh-MO'])).toBe('zh-Hant');
    expect(detectLanguage(null, ['EN-gb'])).toBe('en');
    expect(detectLanguage(null, ['no', 'da'])).toBe('nb');
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

describe('weekdayOrder', () => {
  it('starts on the first weekday and wraps, with every weekday once', () => {
    expect(weekdayOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekdayOrder(6)).toEqual([6, 0, 1, 2, 3, 4, 5]);
    expect(weekdayOrder(3)).toEqual([3, 4, 5, 6, 0, 1, 2]);
    for (const first of [0, 1, 2, 3, 4, 5, 6] as const)
      expect([...weekdayOrder(first)].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('weekdayHeading', () => {
  it('heads a column with the short name, and with the letter in Arabic', () => {
    expect(weekdayHeading(0, 'en-GB')).toBe('Mon');
    expect(weekdayHeading(6, 'vi-VN')).toBe('CN');
    expect(weekdayHeading(0, 'ko-KR')).toBe('월');
    // Arabic's short names are the full ones, too wide for a column.
    expect(weekdayName(0, 'ar', 'short')).toBe('الاثنين');
    expect(weekdayHeading(0, 'ar')).toBe('ن');
    expect(weekdayHeading(6, 'ar-EG')).toBe('ح');
    expect(weekdayHeading(0, 'fa-IR-u-ca-gregory')).toBe('د');
    // Urdu's letters are Latin, so it keeps the short names.
    expect(weekdayHeading(0, 'ur-PK')).toBe('پیر');
    expect(weekdayHeading(0, 'vi-VN')).toBe('T2');
  });

  it('shrinks the headings for the long Urdu names only', () => {
    expect(longWeekdayHeadings('ur-PK')).toBe(true);
    for (const locale of [
      'en-GB',
      'de-DE',
      'pt-BR',
      'pl-PL',
      'nb-NO',
      'vi-VN',
      'ar',
      'fa-IR-u-ca-gregory',
      'ko-KR',
      'zh-TW',
    ])
      expect(longWeekdayHeadings(locale), locale).toBe(false);
  });
});

describe('weekdayName', () => {
  it('names Monday as 0 and Sunday as 6, short and long', () => {
    expect(weekdayName(0, 'en', 'short')).toBe('Mon');
    expect(weekdayName(0, 'en', 'long')).toBe('Monday');
    expect(weekdayName(6, 'en', 'long')).toBe('Sunday');
  });

  it('follows the locale', () => {
    expect(weekdayName(0, 'de', 'short')).toBe('Mo');
    expect(weekdayName(2, 'de', 'long')).toBe('Mittwoch');
  });
});

describe('routes', () => {
  it('knows the five pages', () => {
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
    expect(parseRoute('/es-419')).toEqual({ page: 'home', language: 'es-419' });
    expect(parseRoute('/pt-BR/')).toEqual({ page: 'home', language: 'pt-BR' });
    expect(parseRoute('/es-123')).toEqual({ page: 'not-found' });
    expect(parseRoute('/zh-Hant')).toEqual({
      page: 'home',
      language: 'zh-Hant',
    });
    expect(parseRoute('/zh-Hans')).toEqual({
      page: 'home',
      language: 'zh-Hans',
    });
    expect(parseRoute('/pl')).toEqual({ page: 'home', language: 'pl' });
    expect(parseRoute('/cs')).toEqual({ page: 'home', language: 'cs' });
    expect(parseRoute('/nb')).toEqual({ page: 'home', language: 'nb' });
    expect(parseRoute('/sv')).toEqual({ page: 'home', language: 'sv' });
    expect(parseRoute('/fi')).toEqual({ page: 'home', language: 'fi' });
    expect(parseRoute('/id')).toEqual({ page: 'home', language: 'id' });
    expect(parseRoute('/tr')).toEqual({ page: 'home', language: 'tr' });
    expect(parseRoute('/ru')).toEqual({ page: 'home', language: 'ru' });
    expect(parseRoute('/ar')).toEqual({ page: 'home', language: 'ar' });
    for (const language of ['en', 'es', 'fr', 'it', 'nl', 'pt'] as const)
      expect(parseRoute(`/${language}`)).toEqual({ page: 'home', language });
  });

  it('refuses malformed event ids and unknown paths', () => {
    for (const path of [
      '/e/short',
      '/e/7gT4kPq2Wx9',
      '/e/7gT4kPq2Wx9Za',
      '/e/',
      '/e//',
      '/e/7gT4kPq2Wx9Z//',
      '/e/7gT4kPq2Wx9%20',
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

  it('titles privacy, imprint and unknown paths by their heading, and leaves the others to themselves', () => {
    expect(headingKey(parseRoute('/privacy'))).toBe('privacy.title');
    expect(headingKey(parseRoute('/privacy/'))).toBe('privacy.title');
    expect(headingKey(parseRoute('/imprint'))).toBe('imprint.title');
    expect(headingKey(parseRoute('/nope'))).toBe('notFound.title');
    // The start page has its tagline, an event its own title.
    expect(headingKey(parseRoute('/'))).toBeNull();
    expect(headingKey(parseRoute('/de'))).toBeNull();
    expect(headingKey(parseRoute('/e/7gT4kPq2Wx9Z'))).toBeNull();
  });

  it('gives each of those titles a text in every language, none like the start page title or another', () => {
    const dictionaries = { de, en, es, fr, it: italian, ja, nl, pt };
    for (const [language, dictionary] of Object.entries(dictionaries)) {
      const name = dictionary['app.name'];
      const titles = [`${name} — ${dictionary['app.tagline']}`];
      for (const path of ['/privacy', '/imprint', '/nope']) {
        const heading = dictionary[headingKey(parseRoute(path))!];
        expect(heading.trim(), `${language} ${path}`).not.toBe('');
        titles.push(`${heading} · ${name}`);
      }
      expect(new Set(titles).size, language).toBe(4);
    }
  });

  it('keeps one place for the start page in every language and for one event, and tells the rest apart', () => {
    const place = (path: string) => placeOf(parseRoute(path));
    expect(place('/')).toBe(place('/de'));
    expect(place('/de')).toBe(place('/ja/'));
    expect(place('/privacy')).toBe(place('/privacy/'));
    expect(place('/e/7gT4kPq2Wx9Z')).toBe(place('/e/7gT4kPq2Wx9Z/'));
    expect(place('/e/7gT4kPq2Wx9Z')).not.toBe(place('/e/7gT4kPq2Wx9Y'));
    const places = [
      '/',
      '/privacy',
      '/imprint',
      '/e/7gT4kPq2Wx9Z',
      '/nope',
    ].map(place);
    expect(new Set(places).size).toBe(5);
  });

  it('navigates with history, optionally replacing and carrying state', () => {
    const { window } = installBrowser();
    navigate('/privacy');
    expect(window.location.pathname).toBe('/privacy');
    navigate('/e/7gT4kPq2Wx9Z', { replace: true, state: { created: true } });
    expect(window.history.state).toEqual({ created: true });
    expect(window.scrollTo).toHaveBeenCalledTimes(2);
  });

  it('does not add a history entry for the page one is on', () => {
    const { window } = installBrowser();
    navigate('/privacy');
    expect(window.history.length).toBe(2);
    navigate('/privacy');
    navigate('/privacy');
    expect(window.history.length).toBe(2);
    expect(window.scrollTo).toHaveBeenCalledTimes(3);
    // The start page from the start page, the logo's case.
    navigate('/', { replace: true });
    navigate('/');
    navigate('/');
    expect(window.history.length).toBe(2);
  });

  it('still pushes for another path, a query string or a trailing slash', () => {
    const { window } = installBrowser();
    navigate('/privacy');
    expect(window.history.length).toBe(2);
    navigate('/privacy?x=1');
    expect(window.history.length).toBe(3);
    expect(window.location.search).toBe('?x=1');
    navigate('/privacy?x=1'); // same again: no new entry
    expect(window.history.length).toBe(3);
    navigate('/privacy?x=2');
    expect(window.history.length).toBe(4);
    navigate('/privacy/');
    expect(window.history.length).toBe(5);
    navigate('/');
    expect(window.history.length).toBe(6);
  });

  it('keeps the history state when the same page is asked for again, and takes a new one', () => {
    const { window } = installBrowser();
    navigate('/e/7gT4kPq2Wx9Z', { state: { created: true } });
    navigate('/e/7gT4kPq2Wx9Z');
    expect(window.history.state).toEqual({ created: true });
    expect(window.history.length).toBe(2);
    navigate('/e/7gT4kPq2Wx9Z', { state: { created: false } });
    expect(window.history.state).toEqual({ created: false });
    expect(window.history.length).toBe(2);
  });

  it('tells subscribers even when it adds no entry', () => {
    installBrowser();
    let calls = 0;
    const unsubscribe = subscribeToRoute(() => (calls += 1));
    navigate('/privacy');
    navigate('/privacy');
    unsubscribe();
    expect(calls).toBe(2);
  });

  it('replaces the entry when asked to, whatever the address', () => {
    const { window } = installBrowser();
    navigate('/privacy', { replace: true });
    expect(window.history.length).toBe(1);
    navigate('/de', { replace: true });
    expect(window.history.length).toBe(1);
    expect(window.location.pathname).toBe('/de');
  });

  it('changes only the address when told to keep the scroll position', () => {
    const { window } = installBrowser();
    navigate('/de', { replace: true, keepScroll: true });
    expect(window.location.pathname).toBe('/de');
    expect(window.scrollTo).not.toHaveBeenCalled();
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
