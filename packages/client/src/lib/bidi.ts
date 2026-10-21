/**
 * Wraps user text in a first-strong isolate (U+2068 ... U+2069), so a title in
 * one script cannot reorder the sentence around it in another.
 */
export function isolate(text: string): string {
  return `\u2068${text}\u2069`;
}

const RTL_LETTER = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/u;

/** The same, only when the text has right-to-left letters, for text that leaves the app. */
export function isolateIfRtl(text: string): string {
  return RTL_LETTER.test(text) ? isolate(text) : text;
}
