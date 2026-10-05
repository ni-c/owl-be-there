import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  charCount,
  cleanLine,
  cleanText,
  mixesScripts,
  nameKey,
} from '../src/index.js';

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

describe('mixesScripts', () => {
  it('finds a Cyrillic or Greek letter inside a Latin word', () => {
    expect(mixesScripts('M\u0430x')).toBe(true);
    expect(mixesScripts('M\u03B1x')).toBe(true);
    expect(mixesScripts('\u0430Max')).toBe(true);
    expect(mixesScripts('Max \u041E\u043B\u044C\u0433\u0430 Ma\u0445')).toBe(
      true
    );
  });

  it('leaves single-script words and mixed names alone', () => {
    expect(mixesScripts('')).toBe(false);
    expect(mixesScripts('Max')).toBe(false);
    expect(mixesScripts('\u041E\u043B\u044C\u0433\u0430')).toBe(false);
    expect(mixesScripts('Olga \u041E\u043B\u044C\u0433\u0430')).toBe(false);
    expect(mixesScripts("O'Neil \u0391\u03BB\u03AD\u03BE\u03B7\u03C2")).toBe(
      false
    );
    expect(mixesScripts('42 🦉 \u3042\u3044')).toBe(false);
    expect(mixesScripts('Jos\u00E9')).toBe(false);
  });

  it('judges a name the way its key is built', () => {
    // A full-width Latin letter next to a Cyrillic one is still a mix.
    expect(mixesScripts('\uFF2D\u0430x')).toBe(true);
    // A decomposed accent is part of its word, not a break.
    expect(mixesScripts('Jose\u0301')).toBe(false);
  });
});

describe('default-ignorable characters in name keys', () => {
  it('cannot mint a second name with a tag character, a format control or a filler', () => {
    for (const invisible of [
      '\u{E0041}',
      '\u{E007F}',
      '\u206A',
      '\u206F',
      '\u17B4',
      '\u17B5',
      '\u{1D173}',
      '\u{1D17A}',
      '\uFE0F',
      '\u200D',
      '\u180B',
    ]) {
      expect(nameKey(`Max${invisible}`), invisible).toBe('max');
      expect(nameKey(`${invisible}Max`), invisible).toBe('max');
    }
  });

  it('gives a name of only such characters an empty key', () => {
    expect(nameKey('\u{E0041}')).toBe('');
    expect(nameKey('\u206A')).toBe('');
    expect(nameKey('\u17B4\u17B5')).toBe('');
    expect(nameKey('\u3164')).toBe('');
    expect(nameKey('\u2800')).toBe('');
  });

  it('keeps what is visible', () => {
    expect(nameKey('Zoë')).toBe('zoë');
    expect(nameKey('李雷')).toBe('李雷');
    expect(nameKey('Max 🦉')).toBe('max 🦉');
  });

  it('leaves a title its variation selector', () => {
    expect(cleanLine('Party \u2764\uFE0F')).toBe('Party \u2764\uFE0F');
    expect(cleanLine('Max\u{E0041}')).toBe('Max\u{E0041}');
  });
});

describe('noncharacters', () => {
  it('removes U+FFFE and U+FFFF from a line and from a text', () => {
    expect(cleanLine('A\uFFFFB')).toBe('AB');
    expect(cleanLine('A\uFFFEB')).toBe('AB');
    expect(cleanLine('\uFFFF')).toBe('');
    expect(cleanText('one\uFFFF\ntwo\uFFFE')).toBe('one\ntwo');
  });
});

describe('lone surrogates', () => {
  it('become U+FFFD, as SQLite would store them', () => {
    expect(cleanLine('a\ud800')).toBe('a\uFFFD');
    expect(cleanLine('\ud800a')).toBe('\uFFFDa');
    expect(cleanLine('\udc00\ud800')).toBe('\uFFFD\uFFFD');
    expect(cleanText('x\ud800\ny\udc00')).toBe('x\uFFFD\ny\uFFFD');
  });

  it('leave a well-formed pair alone', () => {
    expect(cleanLine('a\ud83e\udd89')).toBe('a🦉');
  });

  it('give every lone surrogate the key of U+FFFD', () => {
    expect(nameKey('x\ud800')).toBe(nameKey('x\ud801'));
    expect(nameKey('x\ud800')).toBe(nameKey('x\uFFFD'));
    expect(nameKey('x\udfff')).toBe(nameKey('x\uFFFD'));
  });
});

describe('the order of cleaning', () => {
  it('turns vertical tab, form feed and next line into spaces', () => {
    expect(cleanLine('Max\u000BFan')).toBe('Max Fan');
    expect(cleanLine('Max\u000CFan')).toBe('Max Fan');
    expect(cleanLine('Max\u0085Fan')).toBe('Max Fan');
    expect(cleanLine('\u000B')).toBe('');
    expect(cleanText('a\u000Bb\nc')).toBe('a b\nc');
  });

  it('is NFC after the invisible characters are gone', () => {
    const raw = 'e\u00AD\u0301';
    expect(cleanLine(raw)).toBe('\u00E9');
    expect(cleanLine(raw)).toBe(cleanLine(raw).normalize('NFC'));
    expect(cleanText(raw)).toBe('\u00E9');
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (raw) => {
        const once = cleanLine(raw);
        expect(cleanLine(once)).toBe(once);
        const text = cleanText(raw);
        expect(cleanText(text)).toBe(text);
      })
    );
    for (const raw of ['', '   ', '\n', 'e\u00AD\u0301', '\u000B\u000B']) {
      expect(cleanLine(cleanLine(raw))).toBe(cleanLine(raw));
      expect(cleanText(cleanText(raw))).toBe(cleanText(raw));
    }
  });
});

describe('charCount', () => {
  it('counts code points', () => {
    expect(charCount('')).toBe(0);
    expect(charCount('abc')).toBe(3);
    expect(charCount('😀😀😀')).toBe(3);
    expect('😀😀😀'.length).toBe(6);
    expect(charCount('\ud800')).toBe(1);
  });
});
