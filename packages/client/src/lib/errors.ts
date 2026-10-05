import { LIMITS } from '@owl/shared';
import type { TranslationKey } from '../i18n/en.ts';
import type { Params } from '../i18n/index.tsx';
import { ApiFailure, NetworkFailure, type Credentials } from './api.ts';
import { PermanentSaveError } from './saveQueue.ts';

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
  invalid_block: 'error.daysChanged',
  busy: 'error.busy',
  changed: 'error.changed',
};

type Translate = (key: TranslationKey, params?: Params) => string;

/** What a day list problem the server names (`invalid_days`) comes down to. */
const BY_DAYS_PROBLEM: Partial<Record<string, TranslationKey>> = {
  past: 'error.past',
  too_far: 'error.tooFar',
  span: 'error.rangeTooLong',
};

/** The paths and messages of a `validation_failed` answer. */
function issuesOf(body: unknown): { path: string; message: string }[] {
  if (typeof body !== 'object' || body === null || !('issues' in body))
    return [];
  const issues = (body as { issues: unknown }).issues;
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((issue: unknown) => {
    if (typeof issue !== 'object' || issue === null) return [];
    const { path, message } = issue as { path?: unknown; message?: unknown };
    return typeof path === 'string' && typeof message === 'string'
      ? [{ path, message }]
      : [];
  });
}

/** The length the server named in "No 4 consecutive candidate days …". */
function runLengthOf(message: string): number | null {
  const match = /^No (\d+) consecutive/.exec(message);
  return match ? Number(match[1]) : null;
}

/** The text for an answer that needs more than its code to be understood. */
function refinedKey(
  failure: { code: string; message: string; body: unknown },
  params: Params
): { key: TranslationKey; params: Params } | null {
  switch (failure.code) {
    case 'password_too_short':
      return {
        key: 'who.passwordTooShort',
        params: { min: LIMITS.passwordMin, ...params },
      };
    case 'no_block': {
      const count = params['count'] ?? runLengthOf(failure.message);
      return count === null
        ? null
        : { key: 'error.noBlock', params: { ...params, count } };
    }
    case 'invalid_days': {
      const key = BY_DAYS_PROBLEM[failure.message];
      return {
        key: key ?? 'error.invalid',
        params: { max: LIMITS.days, ...params },
      };
    }
    case 'validation_failed': {
      const days = issuesOf(failure.body).find(
        (issue) => issue.path === 'days'
      );
      if (!days) return { key: 'error.invalid', params };
      // An empty list fails the lower bound, anything else the upper one.
      const empty = /small|>=/i.test(days.message);
      return {
        key: empty ? 'error.noDays' : 'error.tooManyDays',
        params: { max: LIMITS.days, ...params },
      };
    }
    default:
      return null;
  }
}

/**
 * A sentence for the reader about what went wrong — never a stack trace.
 * `params` fills placeholders only the caller knows, such as the `count` of
 * days in a row the organiser asked for.
 */
export function errorMessage(
  error: unknown,
  t: Translate,
  params: Params = {}
): string {
  if (error instanceof NetworkFailure) return t('error.offline');
  if (error instanceof ApiFailure) {
    const refined = refinedKey(error, params);
    if (refined) return t(refined.key, refined.params);
    const key = BY_CODE[error.code];
    if (key) return t(key);
  }
  if (error instanceof PermanentSaveError) {
    const key = BY_CODE[error.code];
    if (key) return t(key);
  }
  return t('error.generic');
}

/**
 * Whether the server refused because the link's credentials are no longer
 * good — a participant token that a new password revoked, an organiser key
 * that is wrong. Works for what a failed save carries too.
 */
export function isForbidden(error: unknown): boolean {
  return (
    (error instanceof ApiFailure || error instanceof PermanentSaveError) &&
    error.code === 'forbidden'
  );
}

/**
 * Whether a failure means the participant's own token is no longer good — a
 * new password revoked it — so the person has to say who they are again. The
 * organiser filling in for someone acts with the organiser key: a refusal
 * there says nothing about anybody's session.
 */
export function sessionRevoked(
  error: unknown,
  credentials: Credentials
): boolean {
  return (
    isForbidden(error) && !credentials.admin && Boolean(credentials.participant)
  );
}
