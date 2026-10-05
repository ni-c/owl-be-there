import { describe, expect, it } from 'vitest';
import { qrPath } from '../src/lib/qrPath.ts';

describe('qrPath', () => {
  it('draws a link as one path with a quiet zone', () => {
    const qr = qrPath('https://owl.example.org/e/7gT4kPq2Wx9Z');
    expect(qr).not.toBeNull();
    expect(qr!.size).toBeGreaterThan(8);
    expect(qr!.d.startsWith('M')).toBe(true);
    // Every module sits inside the code, clear of the quiet zone's edges.
    for (const [, x, y] of qr!.d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
      expect(Number(x)).toBeGreaterThanOrEqual(4);
      expect(Number(y)).toBeGreaterThanOrEqual(4);
      expect(Number(x)).toBeLessThan(qr!.size - 4);
      expect(Number(y)).toBeLessThan(qr!.size - 4);
    }
  });

  it('draws the longest text a code holds and nothing for one byte more', () => {
    expect(qrPath('a'.repeat(2331))).not.toBeNull();
    expect(qrPath('a'.repeat(2332))).toBeNull();
  });

  it('answers null for far too long a text and an empty text still draws', () => {
    expect(qrPath('a'.repeat(100_000))).toBeNull();
    expect(qrPath('')).not.toBeNull();
  });
});
