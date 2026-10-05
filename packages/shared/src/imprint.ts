/**
 * The legal notice of an instance. The operator states name, postal address
 * and contact in the configuration; the server and the client both decide
 * from the same three values whether the built-in notice exists.
 */
export interface ImprintFields {
  operatorName: string | null;
  operatorAddress: string | null;
  operatorContact: string | null;
}

/** The longest address, in characters, after it was put in its stored form. */
export const ADDRESS_MAX_LENGTH = 300;
/** The most lines an address may have. */
export const ADDRESS_MAX_LINES = 8;

/** Whether the instance has what its own legal notice page needs. */
export function hasImprint(fields: Partial<ImprintFields> | null): boolean {
  return Boolean(
    fields?.operatorName && fields.operatorAddress && fields.operatorContact
  );
}

/**
 * The lines of an address: the parts between commas or line breaks, trimmed,
 * empty parts dropped.
 */
export function addressLines(address: string | null | undefined): string[] {
  if (!address) return [];
  return address
    .split(/[,\n\r]/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/**
 * An address as the configuration states it — one line, parts separated by
 * commas, or several lines — in its stored form: one line, the parts joined
 * by ", ". Anything but a printable text, too many parts or too long a text
 * is an error with the reason.
 */
export function parseAddress(
  raw: string
): { ok: true; value: string | null } | { ok: false; reason: string } {
  // Anything that is not a printable character — control characters, bidi
  // overrides, zero-width marks — except the line break.
  if (/[^\P{C}\n\r]/u.test(raw)) {
    return {
      ok: false,
      reason: 'must not contain control or invisible characters',
    };
  }
  const lines = addressLines(raw);
  if (lines.length === 0) return { ok: true, value: null };
  if (lines.length > ADDRESS_MAX_LINES) {
    return {
      ok: false,
      reason: `must have at most ${ADDRESS_MAX_LINES} parts`,
    };
  }
  const value = lines.join(', ');
  if (value.length > ADDRESS_MAX_LENGTH) {
    return {
      ok: false,
      reason: `must be at most ${ADDRESS_MAX_LENGTH} characters long`,
    };
  }
  return { ok: true, value };
}
