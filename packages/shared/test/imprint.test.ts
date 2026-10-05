import { describe, expect, it } from 'vitest';
import {
  ADDRESS_MAX_LENGTH,
  ADDRESS_MAX_LINES,
  addressLines,
  hasImprint,
  parseAddress,
} from '../src/index.js';

const FULL = {
  operatorName: 'Example Organisation',
  operatorAddress: 'Musterstraße 1, 12345 Musterstadt',
  operatorContact: 'privacy@example.org',
};

describe('hasImprint', () => {
  it('needs name, address and contact', () => {
    expect(hasImprint(FULL)).toBe(true);
    for (const missing of Object.keys(FULL) as (keyof typeof FULL)[]) {
      expect(hasImprint({ ...FULL, [missing]: null }), missing).toBe(false);
      expect(hasImprint({ ...FULL, [missing]: '' }), missing).toBe(false);
    }
  });

  it('is false for nothing at all', () => {
    expect(hasImprint(null)).toBe(false);
    expect(hasImprint({})).toBe(false);
  });
});

describe('addressLines', () => {
  it('splits at commas and line breaks and trims', () => {
    expect(addressLines('A 1, 12345 B,C')).toEqual(['A 1', '12345 B', 'C']);
    expect(addressLines('A 1\n12345 B\r\nC')).toEqual(['A 1', '12345 B', 'C']);
    expect(addressLines('  A 1 ,\n 12345 B  ')).toEqual(['A 1', '12345 B']);
  });

  it('drops empty parts and gives nothing for nothing', () => {
    expect(addressLines(',, ,\n,')).toEqual([]);
    expect(addressLines('')).toEqual([]);
    expect(addressLines(null)).toEqual([]);
    expect(addressLines(undefined)).toEqual([]);
    expect(addressLines('A,,B')).toEqual(['A', 'B']);
  });

  it('keeps one part as one line', () => {
    expect(addressLines('Musterstraße 1')).toEqual(['Musterstraße 1']);
  });
});

describe('parseAddress', () => {
  it('stores the parts as one line', () => {
    expect(parseAddress('A 1\nB')).toEqual({ ok: true, value: 'A 1, B' });
    expect(parseAddress('A 1,B')).toEqual({ ok: true, value: 'A 1, B' });
  });

  it('is null when only separators are left', () => {
    expect(parseAddress(' , \n ')).toEqual({ ok: true, value: null });
    expect(parseAddress('')).toEqual({ ok: true, value: null });
  });

  it('accepts letters of every script', () => {
    expect(parseAddress('東京都千代田区1-1, 100-0001 東京')).toEqual({
      ok: true,
      value: '東京都千代田区1-1, 100-0001 東京',
    });
  });

  it('refuses control, bidi and zero-width characters', () => {
    for (const bad of ['\t', '\u0000', '\u007f', '‮', '​', '﻿']) {
      expect(parseAddress(`A${bad}B`).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('stops at the limits on both sides', () => {
    const parts = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
    expect(parseAddress(parts(ADDRESS_MAX_LINES).join(',')).ok).toBe(true);
    expect(parseAddress(parts(ADDRESS_MAX_LINES + 1).join(',')).ok).toBe(false);
    expect(parseAddress('x'.repeat(ADDRESS_MAX_LENGTH)).ok).toBe(true);
    expect(parseAddress('x'.repeat(ADDRESS_MAX_LENGTH + 1)).ok).toBe(false);
  });
});
