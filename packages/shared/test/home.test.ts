import { describe, expect, it } from 'vitest';
import {
  DESCRIPTION_EN,
  FAQ_TOPICS,
  FEATURES,
  LANGUAGES,
  RETENTION_DAYS,
  persianNumber,
  type HomeKey,
} from '../src/index.js';
import { HOME_TEXTS } from '../src/home-texts.js';
import { HOME as persian } from '../src/home/fa.js';
import { HOME as simplifiedChinese } from '../src/home/zh-Hans.js';
import * as shared from '../src/index.js';

const keys = Object.keys(HOME_TEXTS.en) as HomeKey[];

describe('start page texts', () => {
  it('ask every question in every language, and nothing else', () => {
    // The lead and the FAQ title, and a title and a text for each feature and question.
    expect(keys).toHaveLength(2 + 2 * FEATURES.length + 2 * FAQ_TOPICS.length);
    for (const language of LANGUAGES) {
      expect(Object.keys(HOME_TEXTS[language]).sort(), language).toEqual(
        [...keys].sort()
      );
      for (const key of keys)
        expect(HOME_TEXTS[language][key].trim(), `${language} ${key}`).not.toBe(
          ''
        );
    }
  });

  it('never repeat a question or an answer within one language', () => {
    for (const language of LANGUAGES) {
      const texts = HOME_TEXTS[language];
      for (const part of ['q', 'a'] as const) {
        const all = FAQ_TOPICS.map(
          (topic) => texts[`home.faq.${topic}.${part}`]
        );
        expect(new Set(all).size, `${language} ${part}`).toBe(all.length);
      }
    }
  });

  it('translate every text, keeping only the English one in English', () => {
    for (const language of LANGUAGES) {
      if (language === 'en') continue;
      for (const key of keys) {
        if (key === 'home.faq.title' && language === 'fr') continue; // "Questions" in both
        expect(HOME_TEXTS[language][key], `${language} ${key}`).not.toBe(
          HOME_TEXTS.en[key]
        );
      }
    }
    expect(HOME_TEXTS.en['home.lead']).toBe(DESCRIPTION_EN);
  });

  it('show the questions in a fixed order without duplicates', () => {
    expect(new Set(FAQ_TOPICS).size).toBe(FAQ_TOPICS.length);
    expect(FAQ_TOPICS[0]).toBe('free');
  });
});

describe('feature cards', () => {
  it('are listed once, in the order they are shown', () => {
    expect(FEATURES.length).toBeGreaterThan(0);
    expect(new Set(FEATURES).size).toBe(FEATURES.length);
    expect(FEATURES[0]).toBe('heat');
  });

  it('have a title and a text in every language', () => {
    for (const language of LANGUAGES) {
      for (const feature of FEATURES) {
        for (const part of ['title', 'text'] as const) {
          expect(
            HOME_TEXTS[language][`home.feature.${feature}.${part}`].trim(),
            `${language} ${feature} ${part}`
          ).toBeTruthy();
        }
      }
    }
  });

  it('never repeat a title or a text within one language', () => {
    for (const language of LANGUAGES) {
      for (const part of ['title', 'text'] as const) {
        const all = FEATURES.map(
          (feature) => HOME_TEXTS[language][`home.feature.${feature}.${part}`]
        );
        expect(new Set(all).size, `${language} ${part}`).toBe(all.length);
      }
    }
  });
});

describe('the privacy answer', () => {
  it('names the retention period of the sweep in every language, and no other number', () => {
    for (const language of LANGUAGES) {
      const answer = HOME_TEXTS[language]['home.faq.privacy.a'];
      // Persian writes its own digits.
      const days =
        language === 'fa'
          ? persianNumber.format(RETENTION_DAYS)
          : String(RETENTION_DAYS);
      expect(answer.match(/[\d۰-۹]+/g), language).toEqual([days]);
    }
  });
});

describe('the start page texts, one module per language', () => {
  it('assembles every language from its own module, and keeps them out of the index', () => {
    expect(Object.keys(HOME_TEXTS).sort()).toEqual([...LANGUAGES].sort());
    expect(HOME_TEXTS.fa).toBe(persian);
    expect(HOME_TEXTS['zh-Hans']).toBe(simplifiedChinese);
    // The client loads one language at a time; the index must not pull all in.
    expect('HOME_TEXTS' in shared).toBe(false);
  });
});
