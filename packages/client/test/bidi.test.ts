import { describe, expect, it } from 'vitest';
import { isolate, isolateIfRtl } from '../src/lib/bidi.ts';

describe('isolate', () => {
  it('wraps text in first-strong isolate marks, the empty text too', () => {
    expect(isolate('abc')).toBe('⁨abc⁩');
    expect(isolate('')).toBe('⁨⁩');
  });
});

describe('isolateIfRtl', () => {
  it('leaves left-to-right and empty text alone', () => {
    expect(isolateIfRtl('Team dinner')).toBe('Team dinner');
    expect(isolateIfRtl('')).toBe('');
  });

  it('isolates Hebrew, Arabic and mixed text', () => {
    expect(isolateIfRtl('ארוחה')).toBe('⁨ארוחה⁩');
    expect(isolateIfRtl('عشاء')).toBe('⁨عشاء⁩');
    expect(isolateIfRtl('Dinner عشاء')).toBe('⁨Dinner عشاء⁩');
  });
});
