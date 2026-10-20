import { describe, expect, it } from 'vitest';
import type { SaveStatus } from '../src/lib/saveQueue.ts';
import { shownStatus, type NoteStatus } from '../src/lib/saveStatus.ts';

const DAYS: SaveStatus[] = ['idle', 'saving', 'saved', 'retrying', 'failed'];
const NOTE: NoteStatus[] = ['idle', 'saving', 'saved'];

describe('shownStatus', () => {
  it('gives every combination of days and note one status', () => {
    const table = Object.fromEntries(
      DAYS.map((days) => [
        days,
        NOTE.map((note) => shownStatus(days, note)).join(' '),
      ])
    );
    expect(table).toEqual({
      idle: 'idle saving saved',
      saving: 'saving saving saving',
      saved: 'saved saving saved',
      retrying: 'retrying retrying retrying',
      failed: 'failed failed failed',
    });
  });

  it('never hides a failure or a retry of the days behind a saved note', () => {
    expect(shownStatus('failed', 'saved')).toBe('failed');
    expect(shownStatus('retrying', 'saved')).toBe('retrying');
  });

  it('follows a note from typing to saved, and back to nothing when it failed', () => {
    const steps: NoteStatus[] = ['idle', 'saving', 'saved', 'idle', 'saving'];
    expect(steps.map((note) => shownStatus('idle', note))).toEqual([
      'idle',
      'saving',
      'saved',
      'idle',
      'saving',
    ]);
    // The note failed: its field says so, the status line goes quiet.
    expect(shownStatus('idle', 'idle')).toBe('idle');
  });

  it('keeps the days saved while a note is typed afresh', () => {
    expect(shownStatus('saved', 'idle')).toBe('saved');
  });
});
