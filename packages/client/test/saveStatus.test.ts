import { describe, expect, it } from 'vitest';
import { ApiFailure, NetworkFailure } from '../src/lib/api.ts';
import { PermanentSaveError, type SaveStatus } from '../src/lib/saveQueue.ts';
import {
  closedFailure,
  saveMessageKey,
  shownStatus,
  type NoteStatus,
} from '../src/lib/saveStatus.ts';

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

describe('saveMessageKey', () => {
  const api = (status: number, code = 'x') =>
    new ApiFailure(status, code, code, null);

  it('names the cause of a retry: offline, rate limit, server error', () => {
    expect(saveMessageKey('retrying', new NetworkFailure(new Error('x')))).toBe(
      'mine.retrying'
    );
    expect(saveMessageKey('retrying', api(429, 'rate_limited'))).toBe(
      'error.rateLimited'
    );
    expect(saveMessageKey('retrying', api(500))).toBe('error.busy');
    expect(saveMessageKey('retrying', api(503))).toBe('error.busy');
    expect(saveMessageKey('retrying', api(499))).toBe('mine.retrying');
  });

  it('falls back to the offline text for an unknown or missing error', () => {
    expect(saveMessageKey('retrying', undefined)).toBe('mine.retrying');
    expect(saveMessageKey('retrying', new Error('x'))).toBe('mine.retrying');
  });

  it('says the poll is closed for a refused save, from either error class', () => {
    expect(saveMessageKey('failed', new PermanentSaveError('closed'))).toBe(
      'mine.closed'
    );
    expect(saveMessageKey('failed', api(409, 'closed'))).toBe('mine.closed');
    expect(saveMessageKey('failed', new PermanentSaveError('forbidden'))).toBe(
      null
    );
    expect(saveMessageKey('failed', undefined)).toBe(null);
  });

  it('has nothing to say for the other statuses', () => {
    for (const status of ['idle', 'saving', 'saved'] as const)
      expect(saveMessageKey(status, api(500))).toBe(null);
  });
});

describe('closedFailure', () => {
  it('only matches the closed code', () => {
    expect(closedFailure(new PermanentSaveError('closed'))).toBe(true);
    expect(closedFailure(new PermanentSaveError('full'))).toBe(false);
    expect(closedFailure(null)).toBe(false);
  });
});
