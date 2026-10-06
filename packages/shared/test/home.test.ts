import { describe, expect, it } from 'vitest';
import {
  DESCRIPTION_EN,
  FAQ_TOPICS,
  HOME_TEXTS,
  LANGUAGES,
  type HomeKey,
} from '../src/index.js';

const keys = Object.keys(HOME_TEXTS.en) as HomeKey[];

describe('start page texts', () => {
  it('ask every question in every language, and nothing else', () => {
    expect(keys).toHaveLength(6 + 2 * FAQ_TOPICS.length);
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
