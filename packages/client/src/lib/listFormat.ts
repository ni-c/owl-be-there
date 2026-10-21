import { isolate } from './bidi.ts';

/** Names joined as a list in `locale` ("A, B and C"), each isolated. */
export function joinNames(names: readonly string[], locale: string): string {
  return new Intl.ListFormat(locale, {
    style: 'long',
    type: 'conjunction',
  }).format(names.map(isolate));
}
