/** The keys of the start page's own texts. */
export type HomeKey =
  | 'home.lead'
  | `home.feature.${Feature}.title`
  | `home.feature.${Feature}.text`
  | 'home.faq.title'
  | `home.faq.${FaqTopic}.q`
  | `home.faq.${FaqTopic}.a`;

/** The start page's feature cards, in the order they are shown. */
export const FEATURES = ['heat', 'private'] as const;

export type Feature = (typeof FEATURES)[number];

/** The start page's questions, in the order they are shown. */
export const FAQ_TOPICS = [
  'free',
  'account',
  'doodle',
  'days',
  'messenger',
  'privacy',
] as const;

type FaqTopic = (typeof FAQ_TOPICS)[number];

/** The start page's own texts in one language: `home/<code>.ts`. */
export type HomeTexts = Record<HomeKey, string>;
