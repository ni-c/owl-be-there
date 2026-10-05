/**
 * A QR code, drawn from scratch.
 *
 * It exists for one payload: an event link, shown on a phone so the rest of the
 * group can scan it at the side of the pitch. That is a small job, and it is
 * here rather than in a dependency because a library that runs on every share
 * is a supply chain to keep patched for the sake of a picture.
 *
 * In `shared` because both runtimes want it: the browser draws the matrix as an
 * SVG, and the unit suite checks it against known-good output. Nothing here
 * touches the DOM; the answer is a grid of booleans and what to do with it
 * belongs to whoever asked.
 *
 * **Byte mode, and there was no choice about it.** The alphanumeric mode is
 * half the size and cannot carry this: its alphabet is digits, capitals, space
 * and eight punctuation marks, and an event link is mostly lower case — the id
 * at its end mixes both cases. So the payload is UTF-8 bytes, which is what
 * brings Reed–Solomon over GF(256) with it and most of the length of this file.
 *
 * Error correction level M throughout — about 15 % of the codewords may be lost
 * and it still reads. L would make the picture smaller and a scuffed phone screen
 * is exactly the reading condition this has to survive; Q and H would make it
 * denser for a benefit nobody is asking for.
 *
 * The one thing to know before changing anything: **the mask is a quality
 * decision, not a correctness one.** All eight produce a readable code, and the
 * penalty score below only picks the one that reads most easily. A bug in the
 * scoring is a slightly worse picture, never an unreadable one — which is why
 * the tests check the chosen mask against a reference implementation rather
 * than trusting that a code which scans once scans always.
 */

/** A finished code: `size` × `size` modules, `true` meaning dark. */
export interface QrMatrix {
  readonly size: number;
  /** Indexed `[y][x]`, origin top left. */
  readonly modules: readonly (readonly boolean[])[];
}

/**
 * How many error-correction codewords each block carries, per version, at
 * level M. Index 0 is unused so that the version number indexes directly.
 *
 * Straight out of the specification's tables. There is no formula behind these
 * — they were chosen by the standard's authors — so they are written out, and
 * `qr.test.ts` checks the two of them against the published data capacities
 * rather than against themselves.
 */
const ECC_CODEWORDS_PER_BLOCK = [
  0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26,
  26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  28, 28,
];

/** How many blocks the data is split into, per version, at level M. */
const ECC_BLOCKS = [
  0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17,
  18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];

const MIN_VERSION = 1;
const MAX_VERSION = 40;

/** The generator polynomial for the Galois field, x^8 + x^4 + x^3 + x^2 + 1. */
const GF_POLYNOMIAL = 0x11d;

/** Byte mode, as the four bits that introduce a segment. */
const MODE_BYTE = 0b0100;

/** The two bytes the specification pads with, alternating, after the data. */
const PAD_BYTES = [0xec, 0x11];

/** `size` for a version — 21 modules at version 1, growing by four. */
const sizeOf = (version: number): number => version * 4 + 17;

/**
 * How many bits of *anything* a version holds, function patterns already
 * subtracted.
 *
 * The arithmetic is the specification's and is worth reading once rather than
 * trusting: the square is `(16v + 128)v + 64` bits before anything is reserved,
 * then the alignment patterns come out — each is 25 modules, less the 10 that
 * overlap the timing patterns where they meet it — and from version 7 the two
 * version blocks take 36 more.
 */
function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignments = Math.floor(version / 7) + 2;
    result -= (25 * alignments - 10) * alignments - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** How many data codewords a version holds at level M, ECC subtracted. */
function dataCodewords(version: number): number {
  return (
    Math.floor(rawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[version]! * ECC_BLOCKS[version]!
  );
}

/**
 * How many bits the character count takes, which changes twice on the way up.
 *
 * Eight bits to version 9 and sixteen from version 10 — in byte mode there is
 * no third step. Getting this wrong shifts every bit after it, and the symptom
 * is a code that scans as gibberish rather than one that fails to scan.
 */
const countBits = (version: number): number => (version < 10 ? 8 : 16);

/* -------------------------------------------------------------- the field */

/**
 * Multiplication in GF(256).
 *
 * Russian-peasant multiplication with the reduction folded into the loop: shift
 * left, and whenever that would push a bit past the eighth, exclusive-or the
 * generator polynomial back in. `z >>> 7` reads the bit *before* the shift, so
 * it is one or zero and the result never leaves a byte.
 */
function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * GF_POLYNOMIAL);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/**
 * The Reed–Solomon divisor polynomial of a given degree — the product of
 * `(x - 2^i)` for every `i` below it, with the leading 1 left implicit.
 */
function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMultiply(result[j]!, root);
      if (j + 1 < degree) result[j] = result[j]! ^ result[j + 1]!;
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** The remainder of the data divided by the divisor — the ECC codewords. */
function rsRemainder(data: readonly number[], divisor: readonly number[]) {
  const result = new Array<number>(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift()!;
    result.push(0);
    for (let i = 0; i < divisor.length; i += 1) {
      result[i] = result[i]! ^ gfMultiply(divisor[i]!, factor);
    }
  }
  return result;
}

/* --------------------------------------------------------------- the bits */

/** A growable string of bits, most significant first. */
class BitBuffer {
  readonly bits: number[] = [];

  append(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) this.bits.push((value >>> i) & 1);
  }
}

/**
 * The smallest version that holds this many bytes, or `null` when nothing does.
 *
 * `null` rather than a throw at this level: the caller knows what it was trying
 * to encode and is in a better position to say so.
 */
function versionFor(byteLength: number): number | null {
  for (let version = MIN_VERSION; version <= MAX_VERSION; version += 1) {
    const capacity = dataCodewords(version) * 8;
    if (4 + countBits(version) + byteLength * 8 <= capacity) return version;
  }
  return null;
}

/** The data codewords for one payload: header, bytes, terminator, padding. */
function codewordsFor(data: Uint8Array, version: number): number[] {
  const buffer = new BitBuffer();
  buffer.append(MODE_BYTE, 4);
  buffer.append(data.length, countBits(version));
  for (const byte of data) buffer.append(byte, 8);

  const capacity = dataCodewords(version) * 8;
  // Four zero bits saying "nothing follows". The header is 12 or 20 bits and
  // the data a whole number of bytes, so the length is 4 mod 8 while the
  // capacity is a multiple of 8: the room left is at least four bits, and a
  // full terminator ends on a byte boundary. Then alternating pad bytes to
  // the end.
  buffer.append(0, 4);
  for (let i = 0; buffer.bits.length < capacity; i += 1) {
    buffer.append(PAD_BYTES[i % 2]!, 8);
  }

  const codewords: number[] = [];
  for (let i = 0; i < buffer.bits.length; i += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1)
      byte = (byte << 1) | buffer.bits[i + bit]!;
    codewords.push(byte);
  }
  return codewords;
}

/**
 * Split into blocks, give each its error correction, and interleave the lot.
 *
 * The interleaving is what makes the error correction worth having: a scratch
 * across the picture damages one codeword of each block rather than all of one,
 * and a block can only recover from a bounded number of its own losses.
 *
 * The short blocks come first and the long ones after, each longer by exactly
 * one codeword. That asymmetry is why the data loop below has to skip index
 * `shortLength` for the short blocks instead of walking a rectangle.
 */
function interleave(codewords: readonly number[], version: number): number[] {
  const blocks = ECC_BLOCKS[version]!;
  const eccLength = ECC_CODEWORDS_PER_BLOCK[version]!;
  const totalCodewords = Math.floor(rawDataModules(version) / 8);
  const shortBlocks = blocks - (totalCodewords % blocks);
  const shortLength = Math.floor(totalCodewords / blocks) - eccLength;

  const divisor = rsDivisor(eccLength);
  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < blocks; i += 1) {
    const length = shortLength + (i < shortBlocks ? 0 : 1);
    const block = codewords.slice(offset, offset + length);
    offset += length;
    dataBlocks.push(block);
    eccBlocks.push(rsRemainder(block, divisor));
  }

  const result: number[] = [];
  for (let i = 0; i <= shortLength; i += 1) {
    for (const [index, block] of dataBlocks.entries()) {
      // The short blocks have no codeword at the last index; everything else
      // contributes one per round.
      if (i < shortLength || index >= shortBlocks) result.push(block[i]!);
    }
  }
  for (let i = 0; i < eccLength; i += 1) {
    for (const block of eccBlocks) result.push(block[i]!);
  }
  return result;
}

/* -------------------------------------------------------------- the square */

/** Where the alignment patterns sit, as coordinates that are both row and column. */
function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  // Version 32 is the one place the formula and the published table disagree,
  // and the table wins. It is not a rounding artefact anybody can derive; it is
  // simply what the standard says.
  const step =
    version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = sizeOf(version) - 7; result.length < count; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

/** The grid under construction, with a second grid saying what is untouchable. */
interface Canvas {
  size: number;
  modules: boolean[][];
  /** `true` where a function pattern sits and no data may be written. */
  reserved: boolean[][];
}

function blankCanvas(size: number): Canvas {
  return {
    size,
    modules: Array.from({ length: size }, () =>
      new Array<boolean>(size).fill(false)
    ),
    reserved: Array.from({ length: size }, () =>
      new Array<boolean>(size).fill(false)
    ),
  };
}

function set(canvas: Canvas, x: number, y: number, dark: boolean): void {
  canvas.modules[y]![x] = dark;
  canvas.reserved[y]![x] = true;
}

/** The three big squares in the corners, and the light border beside each. */
function drawFinder(canvas: Canvas, cx: number, cy: number): void {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= canvas.size || y < 0 || y >= canvas.size) continue;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      // Dark at the centre and at ring three, light at rings two and four —
      // which is the 1:1:3:1:1 signature a reader looks for.
      set(canvas, x, y, distance !== 2 && distance !== 4);
    }
  }
}

function drawAlignment(canvas: Canvas, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      set(canvas, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

/**
 * Everything that is not data: the finders, the timing lines, the alignment
 * patterns, the one module that is always dark, and the areas held back for the
 * format and version information.
 */
function drawFunctionPatterns(canvas: Canvas, version: number): void {
  const size = canvas.size;

  // The timing lines first — the alignment patterns drawn afterwards sit on top
  // of them where they meet, which is what the specification asks for.
  for (let i = 0; i < size; i += 1) {
    set(canvas, 6, i, i % 2 === 0);
    set(canvas, i, 6, i % 2 === 0);
  }

  drawFinder(canvas, 3, 3);
  drawFinder(canvas, size - 4, 3);
  drawFinder(canvas, 3, size - 4);

  const positions = alignmentPositions(version);
  for (const [i, cy] of positions.entries()) {
    for (const [j, cx] of positions.entries()) {
      // Not in the three corners, where the finders already are.
      const corner =
        (i === 0 && j === 0) ||
        (i === 0 && j === positions.length - 1) ||
        (i === positions.length - 1 && j === 0);
      if (!corner) drawAlignment(canvas, cx, cy);
    }
  }

  // The dark module. It is always here, and it is not decoration: a reader uses
  // it to tell a code from its own negative.
  set(canvas, 8, size - 8, true);

  // The format and version areas are held back by drawing them now. The format
  // bits are a placeholder (mask 0): they are overwritten once the mask is
  // known. Neither draws the dark module above, which is not part of the format.
  drawFormat(canvas, 0);
  drawVersion(canvas, version);
}

/**
 * The data, laid in two-module columns that snake up and down from the bottom
 * right, skipping everything reserved — and skipping the sixth column outright,
 * because the vertical timing line runs down it.
 */
function drawCodewords(canvas: Canvas, data: readonly number[]): void {
  const size = canvas.size;
  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - step : step;
        if (canvas.reserved[y]![x]) continue;
        // Running out of bits is not an error: the last few modules of a symbol
        // are remainder bits, and the specification leaves them light.
        const bit = index < data.length * 8;
        canvas.modules[y]![x] = bit
          ? ((data[index >>> 3]! >>> (7 - (index & 7))) & 1) === 1
          : false;
        index += 1;
      }
    }
  }
}

/** The eight masks, as the condition under which a module is inverted. */
const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Invert every unreserved module the mask names. Applying it twice undoes it. */
function applyMask(canvas: Canvas, mask: number): void {
  const condition = MASKS[mask]!;
  for (let y = 0; y < canvas.size; y += 1) {
    for (let x = 0; x < canvas.size; x += 1) {
      if (!canvas.reserved[y]![x] && condition(x, y)) {
        canvas.modules[y]![x] = !canvas.modules[y]![x];
      }
    }
  }
}

/** The format bits: level M, the mask, and a BCH code over the two. */
function drawFormat(canvas: Canvas, mask: number): void {
  // `0b00` is level M. The five bits are then extended by ten of BCH(15, 5) and
  // the whole thing exclusive-ored with a constant, so that an all-zero format
  // — which is a legitimate one — is not an all-light area a reader could miss.
  const data = (0b00 << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  const bits = (((data << 10) | remainder) ^ 0x5412) & 0x7fff;

  const size = canvas.size;
  // The first copy, wrapped around the top-left finder.
  for (let i = 0; i <= 5; i += 1) set(canvas, 8, i, ((bits >>> i) & 1) === 1);
  set(canvas, 8, 7, ((bits >>> 6) & 1) === 1);
  set(canvas, 8, 8, ((bits >>> 7) & 1) === 1);
  set(canvas, 7, 8, ((bits >>> 8) & 1) === 1);
  for (let i = 9; i < 15; i += 1) {
    set(canvas, 14 - i, 8, ((bits >>> i) & 1) === 1);
  }
  // The second copy, split between the other two finders — this is what lets a
  // reader recover the format when one corner is damaged.
  for (let i = 0; i < 8; i += 1) {
    set(canvas, size - 1 - i, 8, ((bits >>> i) & 1) === 1);
  }
  for (let i = 8; i < 15; i += 1) {
    set(canvas, 8, size - 15 + i, ((bits >>> i) & 1) === 1);
  }
}

/** The version bits, from version 7 up: six of data and twelve of BCH(18, 6). */
function drawVersion(canvas: Canvas, version: number): void {
  if (version < 7) return;
  let remainder = version;
  for (let i = 0; i < 12; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  }
  const bits = (version << 12) | remainder;
  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >>> i) & 1) === 1;
    const a = canvas.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    set(canvas, a, b, dark);
    set(canvas, b, a, dark);
  }
}

/* ------------------------------------------------------------- the scoring */

const PENALTY_RUN = 3;
const PENALTY_BOX = 3;
const PENALTY_FINDER_LIKE = 40;
const PENALTY_IMBALANCE = 10;

/** The two eleven-module sequences that look like a finder pattern to a reader. */
const FINDER_LIKE = [
  [true, false, true, true, true, false, true, false, false, false, false],
  [false, false, false, false, true, false, true, true, true, false, true],
];

/**
 * How badly this arrangement reads — lower is better.
 *
 * Four rules from the specification, and none of them is about correctness: a
 * code that scores badly still decodes. They are about the things that make a
 * camera work harder — long stretches of one colour it can lose its place in,
 * blocks that blur together, sequences it could mistake for a corner marker,
 * and an overall balance that drifts far from half dark.
 *
 * Exported for the suite, which is not the usual reason to export anything and
 * is the right one here: three of the four rules are constant offsets or near
 * enough on any real symbol, so a test that only looks at the finished matrix
 * cannot tell a correct rule from a broken one. Tested directly, each rule is
 * a number somebody can work out on a five-by-five grid by hand.
 */
export function maskPenalty(modules: readonly (readonly boolean[])[]): number {
  const size = modules.length;
  let score = 0;

  // Rule 1, runs of five or more, counted along both axes.
  for (let i = 0; i < size; i += 1) {
    for (const read of [
      (j: number) => modules[i]![j]!,
      (j: number) => modules[j]![i]!,
    ]) {
      let run = 1;
      for (let j = 1; j < size; j += 1) {
        if (read(j) === read(j - 1)) {
          run += 1;
          if (run === 5) score += PENALTY_RUN;
          else if (run > 5) score += 1;
        } else {
          run = 1;
        }
      }
    }
  }

  // Rule 2, every two-by-two block of one colour.
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const colour = modules[y]![x]!;
      if (
        colour === modules[y]![x + 1] &&
        colour === modules[y + 1]![x] &&
        colour === modules[y + 1]![x + 1]
      ) {
        score += PENALTY_BOX;
      }
    }
  }

  // Rule 3, anything that could be mistaken for a finder pattern.
  //
  // Eleven modules wide, entirely inside the symbol. Two variations were tried
  // and both are recorded here because the next person will wonder: letting the
  // window run into the quiet zone, on the grounds that the area beside the
  // symbol really is light, made agreement with libqrencode *worse* — and
  // libqrencode matches on a 1:1:3:1:1 *ratio* of any unit size rather than on
  // a fixed eleven modules, which is a reading of the standard as defensible as
  // this one. The rule is famously under-specified and encoders differ; see the
  // note on masks at the top of this file for why that is a difference in the
  // quality of the picture and never in what it says.
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j + 11 <= size; j += 1) {
      for (const pattern of FINDER_LIKE) {
        let row = true;
        let column = true;
        for (let k = 0; k < 11; k += 1) {
          if (modules[i]![j + k] !== pattern[k]) row = false;
          if (modules[j + k]![i] !== pattern[k]) column = false;
        }
        if (row) score += PENALTY_FINDER_LIKE;
        if (column) score += PENALTY_FINDER_LIKE;
      }
    }
  }

  // Rule 4, how far the whole picture is from half dark, in steps of five per
  // cent.
  //
  // The `- 1` is what the specification asks for: `k` is the smallest integer
  // of zero or more with
  // `-(k + 1) * total <= 20 * dark - 10 * total <= (k + 1) * total`, which is
  // `ceil(|20 * dark - 10 * total| / total) - 1`. A plain `ceil` stood here
  // first and was one too many.
  //
  // **It cannot change which mask wins, and that is worth writing down.** The
  // error was a constant ten added to every candidate alike, so the ranking was
  // identical — verified over 260 payloads, on none of which the correction
  // moved the chosen mask. So no test of the *output* can pin this line, which
  // is exactly why `maskPenalty` is exported and tested on its own.
  //
  // The `max` is not belt and braces. At *exactly* half dark the numerator is
  // zero, `ceil` gives zero, and the subtraction takes it to minus one — a
  // negative penalty, which would make a perfectly balanced arrangement score
  // better than the rules allow and, in a grid with nothing else against it,
  // score below nothing at all. No real symbol lands exactly on half, so this
  // never showed in any output; it turned up the moment the rule was asked
  // directly, on a six-by-six chequerboard.
  let dark = 0;
  for (const row of modules) for (const module of row) if (module) dark += 1;
  const total = size * size;
  // An empty grid has no balance to judge.
  if (total > 0) {
    const deviation = Math.max(
      0,
      Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1
    );
    score += deviation * PENALTY_IMBALANCE;
  }

  return score;
}

/* ---------------------------------------------------------------- the door */

/**
 * Encode a string, choosing the smallest version and the best-scoring mask.
 *
 * Throws when the text does not fit in a version 40 symbol at level M — 2 331
 * bytes, which nothing this is used for comes anywhere near. A throw rather
 * than a truncation: half a link in a QR code is a code that scans and then
 * leads somewhere else.
 */
export function encodeQr(text: string): QrMatrix {
  const data = new TextEncoder().encode(text);
  const version = versionFor(data.length);
  if (version === null) {
    throw new RangeError(`${data.length} bytes is too much for a QR code`);
  }

  const codewords = interleave(codewordsFor(data, version), version);

  let best: Canvas | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < MASKS.length; mask += 1) {
    const canvas = blankCanvas(sizeOf(version));
    drawFunctionPatterns(canvas, version);
    drawCodewords(canvas, codewords);
    applyMask(canvas, mask);
    drawFormat(canvas, mask);
    const score = maskPenalty(canvas.modules);
    // Strictly less than, so the lowest-numbered mask wins a tie — which is
    // what every other implementation does, and the reason two of them agree.
    if (score < bestScore) {
      bestScore = score;
      best = canvas;
    }
  }

  return { size: best!.size, modules: best!.modules };
}
