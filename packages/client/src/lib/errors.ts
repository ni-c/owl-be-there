import type { TranslationKey } from '../i18n/en.ts';
import { ApiFailure, NetworkFailure } from './api.ts';

const BY_CODE: Partial<Record<string, TranslationKey>> = {
  rate_limited: 'error.rateLimited',
  forbidden: 'error.forbidden',
  name_taken: 'error.nameTaken',
  creation_disabled: 'home.creationDisabled',
  capacity: 'home.creationDisabled',
  closed: 'who.closed',
  full: 'who.full',
  wrong_password: 'who.wrongPassword',
  slow_down: 'error.slowDown',
  days_changed: 'error.daysChanged',
};

/** A sentence for the reader about what went wrong — never a stack trace. */
export function errorMessage(
  error: unknown,
  t: (key: TranslationKey) => string
): string {
  if (error instanceof NetworkFailure) return t('error.offline');
  if (error instanceof ApiFailure) {
    const key = BY_CODE[error.code];
    if (key) return t(key);
  }
  return t('error.generic');
}
