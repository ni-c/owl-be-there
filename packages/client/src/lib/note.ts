import { cleanLine } from '@owl/shared';

/**
 * What saving a typed note comes to. The server stores the cleaned line
 * (Unicode normalised, invisible characters dropped, white space collapsed),
 * so that is what the typed text is compared with: a note that is already
 * stored in this form is not sent again, and sending it would only be a
 * write that extends the poll's life and makes every client refetch.
 */
export function noteChange(
  typed: string,
  saved: string | null
): { cleaned: string; send: boolean; value: string | null } {
  const cleaned = cleanLine(typed);
  return {
    cleaned,
    send: cleaned !== (saved ?? ''),
    value: cleaned === '' ? null : cleaned,
  };
}
