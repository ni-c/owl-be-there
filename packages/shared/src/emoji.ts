/**
 * The emoji an organiser can give an event: sports first, then the other
 * reasons groups meet. A fixed list rather than free input, so a title can be
 * decorated but a link preview cannot be stuffed with arbitrary symbols, and
 * so every emoji has a translated label for screen readers.
 */
export const EMOJIS = {
  owl: '🦉',
  soccer: '⚽',
  basketball: '🏀',
  volleyball: '🏐',
  handball: '🤾',
  tennis: '🎾',
  badminton: '🏸',
  tableTennis: '🏓',
  hockey: '🏒',
  running: '🏃',
  cycling: '🚴',
  swimming: '🏊',
  hiking: '🥾',
  climbing: '🧗',
  skiing: '⛷️',
  rowing: '🚣',
  golf: '⛳',
  bowling: '🎳',
  frisbee: '🥏',
  yoga: '🧘',
  fitness: '🏋️',
  darts: '🎯',
  chess: '♟️',
  trophy: '🏆',
  party: '🎉',
  barbecue: '🍖',
  drinks: '🍻',
  picnic: '🧺',
  camping: '⛺',
  music: '🎵',
} as const;

export type EmojiKey = keyof typeof EMOJIS;

export const EMOJI_KEYS = Object.keys(EMOJIS) as [EmojiKey, ...EmojiKey[]];

export const DEFAULT_EMOJI: EmojiKey = 'owl';
