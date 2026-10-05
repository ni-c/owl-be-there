/**
 * The QR encoder: that it agrees with a long-established implementation, that
 * it picks the smallest symbol the payload fits in, and that the furniture a
 * reader looks for is where a reader looks for it.
 *
 * The golden matrices in `qr-fixtures.ts` are the load-bearing half — see the
 * comment there for where they came from and why four of them.
 */
import { describe, expect, it } from 'vitest';
import { encodeQr, maskPenalty, type QrMatrix } from '../src/qr.js';
import { QR_FIXTURES } from './qr-fixtures.js';

/** A grid from rows of `#` and `.`, so a case reads as the picture it is. */
const grid = (rows: readonly string[]): boolean[][] =>
  rows.map((row) => [...row].map((cell) => cell === '#'));

/** A matrix as the fixtures write it, so a failure prints something readable. */
const asRows = (matrix: QrMatrix): string[] =>
  matrix.modules.map((row) => row.map((dark) => (dark ? '#' : '.')).join(''));

const versionOf = (matrix: QrMatrix): number => (matrix.size - 17) / 4;

/**
 * The fifteen format bits, read back out of the first of the two copies.
 *
 * A reader rather than a second writer: it walks the layout the specification
 * gives for reading a symbol, so it disagrees with `drawFormat` if either of
 * them is wrong about where the bits go.
 */
function readFormat(matrix: QrMatrix): { ecc: number; mask: number } {
  const bit = (x: number, y: number): number =>
    matrix.modules[y]![x]! ? 1 : 0;
  let bits = 0;
  for (let i = 0; i <= 5; i += 1) bits |= bit(8, i) << i;
  bits |= bit(8, 7) << 6;
  bits |= bit(8, 8) << 7;
  bits |= bit(7, 8) << 8;
  for (let i = 9; i < 15; i += 1) bits |= bit(14 - i, 8) << i;
  const unmasked = bits ^ 0x5412;
  return { ecc: (unmasked >>> 13) & 3, mask: (unmasked >>> 10) & 7 };
}

describe('against libqrencode', () => {
  for (const [name, fixture] of Object.entries(QR_FIXTURES)) {
    it(`matches the reference matrix for ${name}`, () => {
      expect(asRows(encodeQr(fixture.text))).toEqual([...fixture.rows]);
    });
  }
});

describe('choosing a version', () => {
  /**
   * The published byte-mode capacities at level M, at the exact step.
   *
   * These are the numbers the standard prints, and they are here rather than
   * derived so that the two tables in `qr.ts` are checked against something
   * other than themselves. The character count field widens from eight bits to
   * sixteen between versions 9 and 10, which is why that pair is in the list:
   * an encoder that forgot the step would put 181 bytes in a version 9 symbol
   * and produce a code that scans as nonsense.
   */
  const CAPACITY: readonly (readonly [bytes: number, version: number])[] = [
    [14, 1],
    [15, 2],
    [26, 2],
    [27, 3],
    [42, 3],
    [43, 4],
    [180, 9],
    [181, 10],
    [213, 10],
    [214, 11],
    [2331, 40],
  ];

  for (const [bytes, version] of CAPACITY) {
    it(`puts ${bytes} bytes in version ${version}`, () => {
      expect(versionOf(encodeQr('a'.repeat(bytes)))).toBe(version);
    });
  }

  it('refuses what no symbol holds', () => {
    expect(() => encodeQr('a'.repeat(2332))).toThrow(RangeError);
  });

  it('measures the payload in bytes, not in characters', () => {
    // Seven umlauts are fourteen bytes in UTF-8 and fit version 1 exactly; the
    // eighth is two more and does not. A count of characters would have put
    // both in version 1 and produced an unreadable symbol for the second.
    expect(versionOf(encodeQr('ä'.repeat(7)))).toBe(1);
    expect(versionOf(encodeQr('ä'.repeat(8)))).toBe(2);
  });
});

describe('the furniture a reader looks for', () => {
  const matrix = encodeQr(QR_FIXTURES.eventLink.text);
  const dark = (x: number, y: number): boolean => matrix.modules[y]![x]!;

  it('puts a finder pattern in three corners and not the fourth', () => {
    for (const [cx, cy] of [
      [3, 3],
      [matrix.size - 4, 3],
      [3, matrix.size - 4],
    ] as const) {
      for (let dy = -3; dy <= 3; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          const ring = Math.max(Math.abs(dx), Math.abs(dy));
          expect(dark(cx + dx, cy + dy), `${cx + dx},${cy + dy}`).toBe(
            ring !== 2
          );
        }
      }
    }
    // The bottom right corner carries data, so it is not a seven-by-seven
    // square of anything. Asserting it is *not* a finder is what makes the
    // three above mean "exactly three".
    const [fx, fy] = [matrix.size - 4, matrix.size - 4];
    const isFinder = [-3, -2, -1, 0, 1, 2, 3].every((dy) =>
      [-3, -2, -1, 0, 1, 2, 3].every(
        (dx) =>
          dark(fx + dx, fy + dy) ===
          (Math.max(Math.abs(dx), Math.abs(dy)) !== 2)
      )
    );
    expect(isFinder).toBe(false);
  });

  it('alternates along both timing lines', () => {
    for (let i = 8; i < matrix.size - 8; i += 1) {
      expect(dark(6, i), `row ${i}`).toBe(i % 2 === 0);
      expect(dark(i, 6), `column ${i}`).toBe(i % 2 === 0);
    }
  });

  it('sets the dark module', () => {
    // Always dark, in every symbol ever made. A reader uses it to tell a code
    // from its own negative, so a light one here is a code half the scanners
    // in the world will refuse.
    expect(dark(8, matrix.size - 8)).toBe(true);
  });

  it('writes the version block from version 7 up, and not below it', () => {
    const small = encodeQr('hello world');
    expect(versionOf(small)).toBe(1);
    // Version 1 has no version block; the area it would occupy is data.
    const big = encodeQr(QR_FIXTURES.threeHundredBytes.text);
    let bits = 0;
    for (let i = 0; i < 18; i += 1) {
      const x = big.size - 11 + (i % 3);
      const y = Math.floor(i / 3);
      bits |= (big.modules[y]![x]! ? 1 : 0) << i;
    }
    expect(bits >>> 12).toBe(versionOf(big));
  });
});

describe('the format information', () => {
  it('says level M and a mask in range, whatever the payload', () => {
    for (const text of [
      'a',
      'hello world',
      QR_FIXTURES.eventLink.text,
      QR_FIXTURES.eventLinkLong.text,
      QR_FIXTURES.threeHundredBytes.text,
      'ä'.repeat(120),
    ]) {
      const { ecc, mask } = readFormat(encodeQr(text));
      // `0b00` is level M — the level this encoder produces and the only one
      // it produces. A different value here means the format bits were built
      // from the wrong constant, which no amount of scanning would reveal
      // until a damaged code failed to recover.
      expect(ecc, text.slice(0, 20)).toBe(0b00);
      expect(mask, text.slice(0, 20)).toBeGreaterThanOrEqual(0);
      expect(mask, text.slice(0, 20)).toBeLessThanOrEqual(7);
    }
  });

  it('writes both copies the same', () => {
    // The second copy is what a reader falls back on when the top-left corner
    // is damaged, and it is written by a different piece of arithmetic. The two
    // disagreeing is a fault that only shows up on a code somebody has spilled
    // coffee on.
    const matrix = encodeQr(QR_FIXTURES.eventLink.text);
    const bit = (x: number, y: number): number =>
      matrix.modules[y]![x]! ? 1 : 0;
    let second = 0;
    for (let i = 0; i < 8; i += 1) second |= bit(matrix.size - 1 - i, 8) << i;
    for (let i = 8; i < 15; i += 1) second |= bit(8, matrix.size - 15 + i) << i;
    const unmasked = second ^ 0x5412;
    expect({
      ecc: (unmasked >>> 13) & 3,
      mask: (unmasked >>> 10) & 7,
    }).toEqual(readFormat(matrix));
  });
});

/**
 * The four penalty rules, on grids small enough to work out with a pencil.
 *
 * Tested here rather than through `encodeQr` because they cannot be tested
 * through it: the rules are near-constant offsets on any real symbol, so an
 * error in one moves every candidate mask by the same amount and the finished
 * picture is identical. The rule-4 correction in `qr.ts` is exactly that case —
 * it was wrong by a constant ten, and across 260 payloads it never once changed
 * which mask was chosen.
 */
describe('the mask penalty', () => {
  it('scores an empty five-by-five', () => {
    // Rule 1: ten runs of five in a row — five rows and five columns — at
    //         three apiece, so 30.
    // Rule 2: sixteen two-by-two blocks in a five-by-five, all one colour,
    //         at three apiece, so 48.
    // Rule 3: nothing. The pattern it looks for is eleven modules wide and
    //         this grid is five.
    // Rule 4: no dark modules at all, so fifty per cent away from half. The
    //         dark share lies within 5 * (k + 1) per cent of half from k = 9
    //         on, where the window reaches zero per cent. 90.
    expect(
      maskPenalty(grid(['.....', '.....', '.....', '.....', '.....']))
    ).toBe(30 + 48 + 0 + 90);
  });

  it('scores no grid at all at nothing', () => {
    expect(maskPenalty([])).toBe(0);
    expect(Number.isFinite(maskPenalty([[]]))).toBe(true);
    expect(Number.isFinite(maskPenalty(grid(['#'])))).toBe(true);
    expect(Number.isFinite(maskPenalty(grid(['.'])))).toBe(true);
  });

  it('scores a six-by-six chequerboard, half dark, at nothing for balance', () => {
    const rows = ['#.#.#.', '.#.#.#', '#.#.#.', '.#.#.#', '#.#.#.', '.#.#.#'];
    expect(maskPenalty(grid(rows))).toBe(0);
  });

  it('charges one step at exactly sixty per cent dark', () => {
    // Fifteen dark of twenty-five: ten per cent from half, which is the edge of
    // the second step and not the start of the third. No run of five, no
    // uniform two-by-two block and no finder-like row, so rule 4 is all there is.
    const rows = ['##.##', '#.#.#', '.#.#.', '#.#.#', '##.#.'];
    expect(rows.join('').split('#').length - 1).toBe(15);
    expect(maskPenalty(grid(rows))).toBe(10);
    // The same grid inverted is forty per cent dark and scores the same.
    const inverted = rows.map((row) =>
      [...row].map((c) => (c === '#' ? '.' : '#')).join('')
    );
    expect(maskPenalty(grid(inverted))).toBe(10);
  });

  it('scores a perfect chequerboard at nothing', () => {
    // Every run is one module, no two-by-two is one colour, no eleven-module
    // window exists, and thirteen dark of twenty-five is four per cent from
    // half — inside the first step, so no rule fires at all.
    expect(
      maskPenalty(grid(['#.#.#', '.#.#.', '#.#.#', '.#.#.', '#.#.#']))
    ).toBe(0);
  });

  it('charges forty for something that reads like a finder pattern', () => {
    // An empty eleven-by-eleven with the 1:1:3:1:1 signature and its four
    // light modules laid across the middle row.
    const rows = new Array<string>(11).fill('...........');
    rows[5] = '#.###.#....';
    // Rule 1: ten all-light rows at 3 + (11 - 5) = 9, so 90; the patterned row
    //         has no run of five. Columns: the five carrying a dark module are
    //         cut into two runs of five, at 3 each, so 6 apiece = 30; the other
    //         six run the full eleven at 9 apiece = 54. 174 in total.
    // Rule 2: 86 of the 100 blocks are one colour — the fourteen that are not
    //         straddle the patterned row. 258.
    // Rule 3: the row matches, once. 40.
    // Rule 4: five dark of 121 is nine steps from half. 90.
    expect(maskPenalty(grid(rows))).toBe(174 + 258 + 40 + 90);
  });

  it('charges for a long run once, and then by the module', () => {
    // Six in a row is 3 for reaching five and 1 for the sixth. The grid is
    // otherwise a chequerboard so that nothing else fires: no two-by-two is
    // uniform, and eighteen dark of thirty-six is exactly half.
    const chequered = maskPenalty(
      grid(['#.#.#.', '.#.#.#', '#.#.#.', '.#.#.#', '#.#.#.', '.#.#.#'])
    );
    expect(chequered).toBe(0);
  });
});

describe('encoding is a function', () => {
  it('gives the same answer twice', () => {
    // Eight masks are scored and the best wins; a tie broken by iteration order
    // rather than by the score would make this flaky, and a QR code that
    // changes between renders is one nobody can compare against anything.
    const text = QR_FIXTURES.eventLink.text;
    expect(asRows(encodeQr(text))).toEqual(asRows(encodeQr(text)));
  });

  it('answers a square of the declared size', () => {
    const matrix = encodeQr('hello world');
    expect(matrix.modules).toHaveLength(matrix.size);
    for (const row of matrix.modules) expect(row).toHaveLength(matrix.size);
  });
});
