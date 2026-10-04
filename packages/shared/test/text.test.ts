import { describe, expect, it } from 'vitest';
import { cleanLine, cleanText, nameKey } from '../src/index.js';

describe('cleanLine', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanLine('  Summer \t  tournament \n')).toBe('Summer tournament');
  });

  it('removes control characters, bidi overrides and invisible characters', () => {
    expect(cleanLine('Max\u0000\u0007')).toBe('Max');
    expect(cleanLine('\u202Egnissim\u202C')).toBe('gnissim');
    expect(cleanLine('M\u200Bax\uFEFF')).toBe('Max');
  });

  it('normalises to NFC', () => {
    expect(cleanLine('José')).toBe('José');
  });

  it('keeps emoji, including joined ones', () => {
    expect(cleanLine('Team 🏃\u200D♀️')).toBe('Team 🏃\u200D♀️');
  });

  it('turns blank input into an empty string', () => {
    expect(cleanLine('   ')).toBe('');
    expect(cleanLine('')).toBe('');
  });
});

describe('cleanText', () => {
  it('keeps line breaks, normalised to \\n, with at most one empty line', () => {
    expect(cleanText('Bring:\r\n\r\n\r\n- a ball\r- water  \n')).toBe(
      'Bring:\n\n- a ball\n- water'
    );
  });

  it('cleans each line like a single line', () => {
    expect(cleanText('  a   b \n\u202E c')).toBe('a b\nc');
  });
});

describe('nameKey', () => {
  it('treats case, width and spacing variants as the same name', () => {
    const key = nameKey('Max');
    expect(nameKey('MAX')).toBe(key);
    expect(nameKey(' max ')).toBe(key);
    expect(nameKey('Ｍａｘ')).toBe(key);
    expect(nameKey('Ma\u200Dx')).toBe(key);
  });

  it('keeps different names apart', () => {
    expect(nameKey('Max')).not.toBe(nameKey('Maxi'));
    expect(nameKey('Anna B.')).not.toBe(nameKey('Anna'));
  });

  it('handles the dotted capital I without crashing', () => {
    expect(nameKey('İlkay')).toBe('i̇lkay');
  });
});

describe('invisible characters', () => {
  it('removes the soft hyphen and other invisible characters from text', () => {
    expect(cleanLine('Ma\u00ADx')).toBe('Max');
    expect(cleanLine('M\u034Fa\u180Ex\u2062')).toBe('Max');
  });

  it('keeps an emoji its variation selector in text, but not in a name key', () => {
    expect(cleanLine('Party \u2764\uFE0F')).toBe('Party \u2764\uFE0F');
    expect(nameKey('Max\uFE0F')).toBe(nameKey('Max'));
  });

  it('cannot mint a second name with a blank filler or joiner', () => {
    for (const lookalike of [
      'Max\u3164',
      'M\u200Cax',
      'Max\u2800',
      'Ma\u00ADx',
    ]) {
      expect(nameKey(lookalike)).toBe('max');
    }
  });

  it('gives a name of only invisible characters an empty key', () => {
    expect(nameKey('\u200C')).toBe('');
    expect(nameKey('\u3164\u2800')).toBe('');
    expect(nameKey('')).toBe('');
  });
});
