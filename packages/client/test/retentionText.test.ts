import { describe, expect, it } from 'vitest';
import { deletionDay, retentionNote } from '../src/lib/retentionText.ts';

describe('deletionDay', () => {
  it('is the day after the last day the event exists', () => {
    expect(deletionDay('2027-05-30')).toBe('2027-05-31');
  });

  it('crosses month and year ends and a leap day', () => {
    expect(deletionDay('2027-01-31')).toBe('2027-02-01');
    expect(deletionDay('2027-12-31')).toBe('2028-01-01');
    expect(deletionDay('2028-02-28')).toBe('2028-02-29');
    expect(deletionDay('2028-02-29')).toBe('2028-03-01');
  });
});

describe('retentionNote', () => {
  it('leaves the paragraph out when the operator stated nothing', () => {
    expect(retentionNote(null)).toBeNull();
    expect(retentionNote(undefined)).toBeNull();
  });

  it('has its own sentence for zero days', () => {
    expect(retentionNote(0)).toEqual({ kind: 'none' });
  });

  it('counts one, two and the longest period', () => {
    expect(retentionNote(1)).toEqual({ kind: 'days', days: 1 });
    expect(retentionNote(2)).toEqual({ kind: 'days', days: 2 });
    expect(retentionNote(3650)).toEqual({ kind: 'days', days: 3650 });
  });
});
