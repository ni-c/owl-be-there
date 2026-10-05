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

/**
 * An emoji as a favicon: an SVG with one text element, as a data URL. An event
 * page shows its emoji in the browser tab this way, and only this way — the
 * title stays text, so the tab does not show the emoji twice.
 */
export function emojiIcon(emoji: string): string {
  const glyph = emoji
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${glyph}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
