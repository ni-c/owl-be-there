import { charCount, LIMITS } from '@owl/shared';
import { describe, expect, it } from 'vitest';
import { isImeKey, noteChange, passwordLongEnough } from '../src/lib/note.ts';

describe('noteChange', () => {
  it('sends a changed note, cleaned', () => {
    expect(noteChange('  only  after 6 pm ', null)).toEqual({
      cleaned: 'only after 6 pm',
      send: true,
      value: 'only after 6 pm',
    });
  });

  it('does not send a note that is stored in this form already', () => {
    // The server collapsed the double space; typing it again changes nothing.
    expect(noteChange('only  after 6 pm', 'only after 6 pm').send).toBe(false);
    expect(noteChange('same', 'same').send).toBe(false);
  });

  it('treats invisible characters and white space as empty', () => {
    expect(noteChange('\u200B', null)).toEqual({
      cleaned: '',
      send: false,
      value: null,
    });
    expect(noteChange('   ', '')).toMatchObject({ send: false });
    expect(noteChange('', null)).toMatchObject({ send: false });
  });

  it('clears a stored note with null', () => {
    expect(noteChange('', 'later')).toEqual({
      cleaned: '',
      send: true,
      value: null,
    });
    expect(noteChange('\u200B \u2060', 'later')).toMatchObject({
      send: true,
      value: null,
    });
  });

  it('compares in Unicode normal form', () => {
    const decomposed = 'cafe\u0301';
    expect(noteChange(decomposed, 'caf\u00E9')).toMatchObject({
      send: false,
      cleaned: 'caf\u00E9',
    });
  });

  it('sends the typed text when it differs from a note changed elsewhere', () => {
    expect(noteChange('mine', 'theirs')).toMatchObject({ send: true });
  });
});

describe('isImeKey', () => {
  it('is true while an input method composes, by flag or by keyCode 229', () => {
    expect(isImeKey({ isComposing: true, keyCode: 13 })).toBe(true);
    expect(isImeKey({ isComposing: false, keyCode: 229 })).toBe(true);
  });

  it('is false for a plain Enter and for missing fields', () => {
    expect(isImeKey({ isComposing: false, keyCode: 13 })).toBe(false);
    expect(isImeKey({})).toBe(false);
  });
});

describe('passwordLongEnough', () => {
  const min = LIMITS.passwordMin;

  it('counts code points, not UTF-16 units', () => {
    expect(passwordLongEnough('😀'.repeat(min))).toBe(true);
    expect(passwordLongEnough('😀'.repeat(min - 1))).toBe(false);
  });

  it('counts the NFC form: decomposed letters are one character each', () => {
    const decomposed = 'é'.repeat(min - 1);
    expect(charCount(decomposed)).toBe(2 * (min - 1));
    expect(passwordLongEnough(decomposed)).toBe(false);
    expect(passwordLongEnough('é'.repeat(min))).toBe(true);
  });

  it('refuses the empty password and accepts exactly the minimum', () => {
    expect(passwordLongEnough('')).toBe(false);
    expect(passwordLongEnough('a'.repeat(min))).toBe(true);
    expect(passwordLongEnough('a'.repeat(min - 1))).toBe(false);
  });
});
