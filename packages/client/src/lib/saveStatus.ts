import type { SaveStatus } from './saveQueue.ts';

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
