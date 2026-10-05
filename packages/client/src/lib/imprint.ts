import { hasImprint, type ImprintFields } from '@owl/shared';

/** The path of the legal notice the app itself shows. */
export const IMPRINT_PATH = '/imprint';

/**
 * Where the footer's "Imprint" link goes: the operator's own address when
 * `IMPRINT_URL` is set, else the built-in page when the instance has what it
 * needs, else nowhere.
 */
export function imprintLink(
  info: (Partial<ImprintFields> & { imprintUrl?: string | null }) | null
): { kind: 'external' | 'internal'; href: string } | null {
  if (info?.imprintUrl) return { kind: 'external', href: info.imprintUrl };
  if (hasImprint(info)) return { kind: 'internal', href: IMPRINT_PATH };
  return null;
}

/** An address the way mail clients take it: one at-sign, a dotted domain. */
const EMAIL =
  /^[\p{L}\p{N}_+-]+(?:\.[\p{L}\p{N}_+-]+)*@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+$/u;

/** Whether a contact looks like an e-mail address and may become a link. */
export function looksLikeEmail(contact: string): boolean {
  return EMAIL.test(contact);
}

/** The `mailto:` link of a contact, or null when it is not an e-mail address. */
export function mailtoHref(contact: string): string | null {
  return looksLikeEmail(contact) ? `mailto:${contact}` : null;
}
