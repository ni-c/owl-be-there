import { describe, expect, it } from 'vitest';
import { LIMITS, RETENTION_DAYS } from '../src/index.js';

describe('limits', () => {
  it('are all positive integers', () => {
    for (const [name, value] of Object.entries(LIMITS)) {
      expect(Number.isInteger(value), name).toBe(true);
      expect(value, name).toBeGreaterThan(0);
    }
    expect(Number.isInteger(RETENTION_DAYS)).toBe(true);
  });

  it('fit inside each other', () => {
    expect(LIMITS.passwordMin).toBeLessThan(LIMITS.passwordMax);
    expect(LIMITS.days).toBeLessThanOrEqual(LIMITS.span);
    expect(LIMITS.durationDays).toBeLessThanOrEqual(LIMITS.days);
    expect(LIMITS.roster).toBeLessThanOrEqual(LIMITS.participants);
  });
});
