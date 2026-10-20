import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  charCount,
  cleanLine,
  cleanText,
  escapeMarkup,
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

  describe('with default-ignorable characters inside a word', () => {
    // None of these is removed by cleanLine, and none is a letter: they used to
    // cut the word in two, so a lookalike passed as two harmless words.
    const invisibles = [
      ['zero-width joiner', '\u200D'],
      ['zero-width non-joiner', '\u200C'],
      ['tag space', '\u{E0020}'],
      ['tag letter A', '\u{E0041}'],
      ['inhibit symmetric swapping', '\u206A'],
      ['blank Braille pattern', '\u2800'],
    ] as const;

    it.each(invisibles)('sees a mix through a %s', (_label, c) => {
      expect(mixesScripts(`M${c}\u0430${c}x`)).toBe(true);
      expect(mixesScripts(`M${c}\u03B1${c}x`)).toBe(true);
      // At either end of the Cyrillic or Greek run, and between two words'
      // worth of letters with no space in between.
      expect(mixesScripts(`Max${c}\u041C\u0430\u0445`)).toBe(true);
      expect(mixesScripts(`\u041C\u0430\u0445${c}Max`)).toBe(true);
    });

    it.each(invisibles)(
      'leaves one-script words and separate words alone with a %s',
      (_label, c) => {
        expect(mixesScripts(`An${c}na`)).toBe(false);
        expect(mixesScripts(`\u0410\u043D${c}\u043D\u0430`)).toBe(false);
        // A space keeps the two words apart, whatever sits next to it.
        expect(mixesScripts(`Max${c} \u041C\u0430\u0445`)).toBe(false);
        // Nothing but the invisible character.
        expect(mixesScripts(c)).toBe(false);
      }
    );

    it('leaves a Latin word alone however many of them it carries', () => {
      expect(mixesScripts('M\u200D\u200C\u2800ax')).toBe(false);
    });
  });

  it('leaves more names alone', () => {
    expect(mixesScripts('Anna')).toBe(false);
    expect(mixesScripts('\u0410\u043D\u043D\u0430')).toBe(false);
    expect(mixesScripts('Max \u041C\u0430\u0445')).toBe(false);
    expect(mixesScripts('Ivan \u0418\u0432\u0430\u043D')).toBe(false);
    expect(mixesScripts('J\u00F6rg')).toBe(false);
    // An accent in either form stays inside its word.
    expect(mixesScripts('Jos\u00E9')).toBe(false);
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

describe('invisible characters between a letter and its accent', () => {
  const jose = nameKey('Jos\u00E9');

  it('give the name the key of the precomposed form', () => {
    for (const invisible of ['\u200D', '\u200C', '\uFE0F', '\u3164']) {
      expect(nameKey(`Jose${invisible}\u0301`), invisible).toBe(jose);
      // Before the letter, and several in a row.
      expect(nameKey(`${invisible}Jose\u0301`), invisible).toBe(jose);
      expect(nameKey(`Jose${invisible}${invisible}\u0301`), invisible).toBe(
        jose
      );
    }
    expect(nameKey('Jose\u00AD\u0301')).toBe(jose);
    expect(nameKey('Jose\u200B\u0301')).toBe(jose);
    expect(nameKey('Jose\u{E0041}\u0301')).toBe(jose);
    expect(nameKey('Jose\u2800\u0301')).toBe(jose);
    expect(jose).toBe('jos\u00E9');
  });

  it('gives the diaeresis of Zoë the same treatment', () => {
    expect(nameKey('Zoe\u200D\u0308')).toBe(nameKey('Zo\u00EB'));
    expect(nameKey('Zoe\u200D\u0308')).toBe('zo\u00EB');
    expect(nameKey('ZOE\u200C\u0308')).toBe('zo\u00EB');
  });

  it('keeps an accent that is really there, and a different letter apart', () => {
    expect(nameKey('Jose')).not.toBe(jose);
    expect(nameKey('Jose\u200D\u0301')).not.toBe(nameKey('Jose'));
    expect(nameKey('Zoe\u200D\u0308')).not.toBe(nameKey('Zoe'));
  });

  it('collapses the two spaces NFKC makes of a spacing diacritic', () => {
    // U+00A8 becomes a space and a combining diaeresis.
    expect(nameKey('a \u00A8b')).toBe('a \u0308b');
    expect(nameKey('a \u00A8b')).not.toMatch(/\s\s/u);
    expect(nameKey('a\u00A8b')).toBe('a \u0308b');
    // At the ends the space is trimmed away.
    expect(nameKey('\u00A8a')).toBe('\u0308a');
    expect(nameKey('a\u00A8')).toBe('a \u0308');
  });

  it('still treats case, width and spacing variants as one name', () => {
    const key = nameKey('Max');
    for (const variant of ['MAX', 'max', ' Max ', '\uFF2D\uFF41\uFF58']) {
      expect(nameKey(variant), variant).toBe(key);
    }
  });

  it('gives a name of nothing but invisible characters the empty key', () => {
    for (const name of [
      '\u200D\u200C',
      '\u{E0020}\u{E0041}',
      '\u206A\u2800\u3164',
      ' \u200D ',
      '\uFE0F',
    ]) {
      expect(nameKey(name), name).toBe('');
    }
  });

  it('is idempotent', () => {
    for (const name of [
      'Jose\u200D\u0301',
      'Jose\u200C\u0301',
      'Jose\uFE0F\u0301',
      'Jose\u3164\u0301',
      'Zoe\u200D\u0308',
      'a \u00A8b',
      '\u00A8',
      '\u200D\u0301',
      '\u0130stanbul',
      '',
    ]) {
      const key = nameKey(name);
      expect(nameKey(key), name).toBe(key);
    }
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (raw) => {
        const key = nameKey(raw);
        expect(nameKey(key)).toBe(key);
      })
    );
  });

  it('is idempotent for every assigned code point in the places that mattered', () => {
    const wrap = [
      (c: string) => c,
      (c: string) => `x${c}y`,
      (c: string) => `Jose${c}\u0301`,
      (c: string) => `a ${c}b`,
    ];
    for (let cp = 0; cp <= 0x10ffff; cp += 1) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const c = String.fromCodePoint(cp);
      if (/\p{Cn}/u.test(c)) continue;
      for (const make of wrap) {
        const key = nameKey(make(c));
        if (nameKey(key) !== key) {
          expect.fail(`not idempotent for U+${cp.toString(16)}`);
        }
      }
    }
    // A million code points: about 4 s on a CI runner, more under coverage.
  }, 30_000);
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

describe('escapeMarkup', () => {
  it('escapes the five characters markup gives a meaning', () => {
    expect(escapeMarkup(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
    );
  });

  it('escapes an ampersand once, not again in what it produces', () => {
    expect(escapeMarkup('&lt;')).toBe('&amp;lt;');
    expect(escapeMarkup('&&')).toBe('&amp;&amp;');
  });

  it('leaves empty text and plain text alone', () => {
    expect(escapeMarkup('')).toBe('');
    expect(escapeMarkup('Sommerturnier ⚽ 日本語')).toBe(
      'Sommerturnier ⚽ 日本語'
    );
  });
});
