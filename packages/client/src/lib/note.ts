import { charCount, cleanLine, LIMITS } from '@owl/shared';

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

/**
 * Whether a key press belongs to an input method editor still composing; its
 * Enter confirms the candidate and must not save or leave the field. Safari
 * reports the confirming key after `compositionend`, as keyCode 229.
 */
export function isImeKey(event: {
  isComposing?: boolean | undefined;
  keyCode?: number | undefined;
}): boolean {
  return event.isComposing === true || event.keyCode === 229;
}

/** Whether a password is long enough as the server counts it: in its NFC form. */
export function passwordLongEnough(password: string): boolean {
  return charCount(password.normalize('NFC')) >= LIMITS.passwordMin;
}
