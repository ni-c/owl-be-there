/**
 * Cleaning what people type.
 *
 * Text arrives from anyone with a link, so it is normalised before it is
 * stored: one Unicode form, no control characters, and none of the invisible
 * characters that make two names look identical or make a title read backwards
 * (the bidirectional overrides behind "Trojan Source").
 */

// The characters below are exactly what this module exists to remove.
/* eslint-disable no-control-regex */
/** C0 and C1 controls except tab, line feed and carriage return. */
const CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu;
/** Bidirectional embeddings, overrides and isolates, and the Arabic letter mark. */
const BIDI = /[\u202A-\u202E\u2066-\u2069\u061C\u200E\u200F]/gu;
/**
 * Characters that take up no space: zero-width space, word joiner, BOM, soft
 * hyphen, combining grapheme joiner, Mongolian vowel separator and the
 * invisible mathematical operators.
 */
const INVISIBLE = /[\u200B\u2060\uFEFF\u00AD\u180E\u2061-\u2064]|\u034F/gu;
/**
 * Dropped from name keys only: joiners, variation selectors and the blank
 * Hangul and Braille fillers. A title may keep them — an emoji needs its
 * variation selector — but they must not tell two names apart.
 */
const KEY_INVISIBLE =
  /[\u115F\u1160\u3164\uFFA0\u2800]|\u200C|\u200D|\p{Variation_Selector}/gu;
/* eslint-enable no-control-regex */

/**
 * A single-line text field: NFC, cleaned, whitespace runs collapsed to one
 * space, trimmed.
 */
export function cleanLine(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(CONTROLS, '')
    .replace(BIDI, '')
    .replace(INVISIBLE, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * A multi-line text field: as {@link cleanLine}, but line breaks survive —
 * normalised to `\n`, at most one empty line in a row.
 */
export function cleanText(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROLS, '')
    .replace(BIDI, '')
    .replace(INVISIBLE, '')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/gu, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * What decides whether two names are the same person.
 *
 * Compatibility-normalised and lower-cased, so `Max`, `MAX` and a full-width
 * `Ｍａｘ` are one entry; joiners, variation selectors and blank fillers are
 * dropped too, so an invisible character cannot mint a second "Max". A name
 * whose key is empty is no name. The name itself is stored as typed.
 */
export function nameKey(name: string): string {
  return cleanLine(name)
    .normalize('NFKC')
    .toLowerCase()
    .replace(KEY_INVISIBLE, '')
    .trim();
}
