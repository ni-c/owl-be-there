import { formatDay, LOCALES } from '@owl/shared';
import { describe, expect, it } from 'vitest';
import { formattingLocale, nameWithNumber } from '../src/lib/locale.ts';

const day = (locale: string) =>
  formatDay('2026-10-20', locale, { day: 'numeric', month: 'long' });

describe('formattingLocale', () => {
  it('follows the browser region for English', () => {
    expect(formattingLocale('en', ['en-US'])).toBe('en-US');
    expect(day(formattingLocale('en', ['en-US']))).toBe('October 20');
    expect(day(formattingLocale('en', ['en-GB']))).toBe('20 October');
    expect(day(formattingLocale('en', ['en-AU']))).toBe('20 October');
  });

  it('follows the browser region for German', () => {
    expect(formattingLocale('de', ['de-AT'])).toBe('de-AT');
    expect(formattingLocale('de', ['de-CH', 'de-DE'])).toBe('de-CH');
  });

  it('skips tags of other languages and takes the first matching one', () => {
    expect(formattingLocale('en', ['de-DE', 'fr-FR', 'en-US'])).toBe('en-US');
  });

  it('falls back to LOCALES for a tag without a region, an empty list or junk', () => {
    expect(formattingLocale('en', ['en'])).toBe(LOCALES.en);
    expect(formattingLocale('en', [])).toBe(LOCALES.en);
    expect(formattingLocale('en', ['', 'e', 'en_US!!'])).toBe(LOCALES.en);
    expect(formattingLocale('en', ['en', 'en-US'])).toBe('en-US');
  });

  it('uses LOCALES when the browser speaks another language than the interface', () => {
    expect(formattingLocale('fr', ['de-AT'])).toBe(LOCALES.fr);
    expect(formattingLocale('fr', ['de-AT', 'en-US'])).toBe(LOCALES.fr);
  });

  it('keeps the Gregorian calendar and the digits of LOCALES', () => {
    expect(formattingLocale('fa', ['fa-IR'])).toBe('fa-IR-u-ca-gregory');
    const afghan = formattingLocale('fa', ['fa-AF']);
    expect(new Intl.DateTimeFormat(afghan).resolvedOptions().calendar).toBe(
      'gregory'
    );
    const saudi = formattingLocale('ar', ['ar-SA']);
    expect(new Intl.DateTimeFormat(saudi).resolvedOptions().calendar).toBe(
      'gregory'
    );
    expect(new Intl.NumberFormat(saudi).format(12)).toBe('12');
    const egypt = formattingLocale('ar', ['ar-EG']);
    expect(new Intl.NumberFormat(egypt).format(12)).toBe('12');
  });

  it('splits Portuguese into pt and pt-BR', () => {
    expect(formattingLocale('pt-BR', ['pt-BR'])).toBe('pt-BR');
    expect(formattingLocale('pt', ['pt-BR', 'pt-PT'])).toBe('pt-PT');
    expect(formattingLocale('pt', ['pt-BR'])).toBe(LOCALES.pt);
    expect(formattingLocale('pt-BR', ['pt-PT'])).toBe(LOCALES['pt-BR']);
    expect(formattingLocale('pt', ['pt-AO'])).toBe('pt-AO');
  });

  it('splits Chinese by script', () => {
    expect(formattingLocale('zh-Hant', ['zh-TW'])).toBe('zh-TW');
    expect(formattingLocale('zh-Hant', ['zh-HK'])).toBe('zh-HK');
    expect(formattingLocale('zh-Hans', ['zh-TW'])).toBe(LOCALES['zh-Hans']);
    expect(formattingLocale('zh-Hant', ['zh-CN'])).toBe(LOCALES['zh-Hant']);
    expect(formattingLocale('zh-Hans', ['zh-SG'])).toBe('zh-SG');
    expect(formattingLocale('zh-Hant', ['zh-Hant'])).toBe(LOCALES['zh-Hant']);
  });

  it('separates Spain from Latin America', () => {
    expect(formattingLocale('es-419', ['es-MX'])).toBe('es-MX');
    expect(formattingLocale('es', ['es-MX'])).toBe(LOCALES.es);
    expect(formattingLocale('es', ['es-ES'])).toBe('es-ES');
  });
});

describe('nameWithNumber', () => {
  it('leaves a name that holds the number as a word', () => {
    expect(nameWithNumber('1', 'Sunday 1 November: not marked')).toBe(
      'Sunday 1 November: not marked'
    );
    expect(nameWithNumber('12', '12 de noviembre')).toBe('12 de noviembre');
  });

  it('puts the number first where it only sits inside "1일"', () => {
    expect(nameWithNumber('1', '11월 1일 일요일: 가능')).toBe(
      '1, 11월 1일 일요일: 가능'
    );
    expect(nameWithNumber('31', '12월 31일 목요일')).toBe(
      '31, 12월 31일 목요일'
    );
  });

  it('does not take a digit of a longer number for the number', () => {
    expect(nameWithNumber('1', 'Tuesday 11 November')).toBe(
      '1, Tuesday 11 November'
    );
    expect(nameWithNumber('1', '')).toBe('1, ');
  });
});
