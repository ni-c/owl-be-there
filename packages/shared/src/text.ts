/**
 * Cleaning what people type.
 *
 * Text arrives from anyone with a link, so it is normalised before it is
 * stored: one Unicode form, well-formed UTF-16, no control characters, and none
 * of the invisible characters that make two names look identical or make a
 * title read backwards (the bidirectional overrides behind "Trojan Source").
 */

// The characters below are exactly what this module exists to remove.
/* eslint-disable no-control-regex */
/**
 * C0 and C1 controls except tab, line feed, carriage return and the three that
 * are whitespace (see {@link SPACE_CONTROLS}), and the noncharacters U+FFFE and
 * U+FFFF, which XML refuses: the link-preview picture is an SVG document.
 */
const CONTROLS =
  /[\u0000-\u0008\u000E-\u001F\u007F-\u0084\u0086-\u009F\uFFFE\uFFFF]/gu;
/** Vertical tab, form feed and next line: controls that separate words. */
const SPACE_CONTROLS = /[\u000B\u000C\u0085]/gu;
/** UTF-16 surrogates left without their partner; no encoding keeps them. */
const LONE_SURROGATES = /\p{Surrogate}/gu;
/** Bidirectional embeddings, overrides and isolates, and the Arabic letter mark. */
const BIDI = /[\u202A-\u202E\u2066-\u2069\u061C\u200E\u200F]/gu;
/**
 * Characters that take up no space: zero-width space, word joiner, BOM, soft
 * hyphen, combining grapheme joiner, Mongolian vowel separator and the
 * invisible mathematical operators.
 */
const INVISIBLE = /[\u200B\u2060\uFEFF\u00AD\u180E\u2061-\u2064]|\u034F/gu;
/**
 * Dropped from name keys only: every default-ignorable code point (joiners,
 * variation selectors, the tag characters, the invisible format controls and
 * the blank Hangul fillers) and the blank Braille pattern, which is not
 * default-ignorable. A title may keep them — an emoji needs its variation
 * selector — but they must not tell two names apart.
 */
const KEY_INVISIBLE = /\p{Default_Ignorable_Code_Point}|\u2800/gu;
/* eslint-enable no-control-regex */

/**
 * What both cleaners start with: no lone surrogates (SQLite would store them
 * as U+FFFD and a name would then be two different things in memory and on
 * disk), controls that separate words turned into spaces, everything
 * invisible removed, and only then one Unicode form — removing a soft hyphen
 * between a letter and its accent lets the two combine.
 */
function scrub(raw: string): string {
  return raw
    .replace(LONE_SURROGATES, '\uFFFD')
    .replace(SPACE_CONTROLS, ' ')
    .replace(CONTROLS, '')
    .replace(BIDI, '')
    .replace(INVISIBLE, '')
    .normalize('NFC');
}

/**
 * A single-line text field: NFC, cleaned, whitespace runs collapsed to one
 * space, trimmed.
 */
export function cleanLine(raw: string): string {
  return scrub(raw).replace(/\s+/gu, ' ').trim();
}

/**
 * A multi-line text field: as {@link cleanLine}, but line breaks survive —
 * normalised to `\n`, at most one empty line in a row.
 */
export function cleanText(raw: string): string {
  return scrub(raw.replace(/\r\n?/g, '\n'))
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/gu, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The length limits count in code points, which is what the schemas and the
 * database count. `string.length` counts UTF-16 units and gives an emoji two.
 */
export function charCount(text: string): number {
  return [...text].length;
}

/**
 * What decides whether two names are the same person.
 *
 * Compatibility-normalised and lower-cased, so `Max`, `MAX` and a full-width
 * `Ｍａｘ` are one entry; joiners, variation selectors, tag characters and
 * blank fillers are dropped too, so an invisible character cannot mint a
 * second "Max". A name
 * whose key is empty is no name. The name itself is stored as typed.
 */
export function nameKey(name: string): string {
  return cleanLine(name)
    .normalize('NFKC')
    .toLowerCase()
    .replace(KEY_INVISIBLE, '')
    .trim();
}

/**
 * Whether one word mixes Latin letters with Cyrillic or Greek ones: a Cyrillic
 * "а" in "Max" looks the same on screen and is another letter, so the name
 * would be a second "Max" beside the first. Whole words in one script stay
 * fine, and so do names in two scripts as long as no single word is — the
 * all-Cyrillic lookalike of a Latin name is left alone.
 */
export function mixesScripts(name: string): boolean {
  return (name.normalize('NFKC').match(/[\p{L}\p{M}]+/gu) ?? []).some(
    (word) =>
      /\p{Script=Latin}/u.test(word) &&
      /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(word)
  );
}

/**
 * Text made safe for HTML and XML, in element content and in a quoted
 * attribute alike: the five characters that markup gives a meaning.
 */
export function escapeMarkup(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
