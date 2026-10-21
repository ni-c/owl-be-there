import { describe, expect, it } from 'vitest';
import { isolate } from '../src/lib/bidi.ts';
import { joinNames } from '../src/lib/listFormat.ts';

const strip = (text: string) => text.replace(/[\u2068\u2069]/g, '');

describe('joinNames', () => {
  it('joins in the language of the interface', () => {
    expect(strip(joinNames(['Ann', 'Ben', 'Cy'], 'en'))).toBe(
      'Ann, Ben, and Cy'
    );
    expect(strip(joinNames(['Ann', 'Ben', 'Cy'], 'de'))).toBe(
      'Ann, Ben und Cy'
    );
    expect(strip(joinNames(['Ann', 'Ben'], 'ar'))).toContain('و');
  });

  it('handles one name and none', () => {
    expect(strip(joinNames(['Ann'], 'en'))).toBe('Ann');
    expect(joinNames([], 'en')).toBe('');
  });

  it('isolates every name, so a right-to-left name cannot reorder its neighbours', () => {
    const joined = joinNames(['אבי', 'Ann'], 'en');
    expect(joined).toContain(isolate('אבי'));
    expect(joined).toContain(isolate('Ann'));
  });

  it('keeps a name that contains a comma in one piece', () => {
    expect(joinNames(['Smith, J.', 'Ann'], 'en')).toContain(
      isolate('Smith, J.')
    );
  });
});
