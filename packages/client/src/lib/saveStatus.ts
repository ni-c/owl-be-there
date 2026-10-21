import type { TranslationKey } from '../i18n/en.ts';
import { ApiFailure } from './api.ts';
import { PermanentSaveError, type SaveStatus } from './saveQueue.ts';

export type NoteStatus = 'idle' | 'saving' | 'saved';

/**
 * The one save status the panel shows for the days and the note together.
 * Trouble with the days comes first, then anything still being saved; "saved"
 * once either has landed.
 */
export function shownStatus(days: SaveStatus, note: NoteStatus): SaveStatus {
  if (days === 'failed' || days === 'retrying' || days === 'saving')
    return days;
  if (note === 'saving') return 'saving';
  if (days === 'saved' || note === 'saved') return 'saved';
  return 'idle';
}

/** Whether a save failed because the poll closed. */
export function closedFailure(error: unknown): boolean {
  return (
    (error instanceof ApiFailure || error instanceof PermanentSaveError) &&
    error.code === 'closed'
  );
}

/**
 * The text for a save status that needs more than its name: a retry after a
 * rate limit or a server error is not "offline", and a refusal because the
 * poll closed is not the join-only message. `null` leaves it to the caller.
 */
export function saveMessageKey(
  status: SaveStatus,
  error: unknown
): TranslationKey | null {
  if (status === 'failed') return closedFailure(error) ? 'mine.closed' : null;
  if (status !== 'retrying' || !(error instanceof ApiFailure))
    return status === 'retrying' ? 'mine.retrying' : null;
  if (error.status === 429 || error.code === 'rate_limited')
    return 'error.rateLimited';
  if (error.status >= 500) return 'error.busy';
  return 'mine.retrying';
}
