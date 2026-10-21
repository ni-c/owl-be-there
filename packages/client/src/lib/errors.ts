import { ISSUE_REASON, LIMITS } from '@owl/shared';
import type { TranslationKey } from '../i18n/en.ts';
import type { Params } from '../i18n/index.tsx';
import { ApiFailure, NetworkFailure, type Credentials } from './api.ts';
import { CANDIDATE_PROBLEM_KEY } from './dayEdit.ts';
import { PermanentSaveError } from './saveQueue.ts';

const BY_CODE: Partial<Record<string, TranslationKey>> = {
  rate_limited: 'error.rateLimited',
  creation_limit: 'error.createLimit',
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
const BY_DAYS_PROBLEM: Partial<Record<string, TranslationKey>> =
  CANDIDATE_PROBLEM_KEY;

interface Issue {
  path: string;
  code: string;
  reason: string | null;
}

/** The path, zod code and refinement reason of a `validation_failed` answer. */
function issuesOf(body: unknown): Issue[] {
  if (typeof body !== 'object' || body === null || !('issues' in body))
    return [];
  const issues = (body as { issues: unknown }).issues;
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((issue: unknown) => {
    if (typeof issue !== 'object' || issue === null) return [];
    const { path, code, reason } = issue as {
      path?: unknown;
      code?: unknown;
      reason?: unknown;
    };
    return typeof path === 'string' && typeof code === 'string'
      ? [{ path, code, reason: typeof reason === 'string' ? reason : null }]
      : [];
  });
}

/**
 * The text for a refused name, title or other line, named by field or line,
 * or null when the issue is something else. `roster.N` and `names.N` count
 * from 0 in the list the client sent.
 */
function textIssueKey(
  issue: Issue
): { key: TranslationKey; params: Params } | null {
  if (issue.code !== 'custom') return null;
  const invisible = issue.reason === ISSUE_REASON.invisible;
  const mixed = issue.reason === ISSUE_REASON.mixedScripts;
  if (!invisible && !mixed) return null;
  if (issue.path === 'name')
    return {
      key: invisible ? 'error.nameInvisible' : 'error.nameMixed',
      params: {},
    };
  if (invisible && /^(title|location|creatorName)$/.test(issue.path))
    return { key: 'error.textInvisible', params: {} };
  const row = /^(?:roster|names)\.(\d+)$/.exec(issue.path);
  if (!row) return null;
  return {
    key: invisible ? 'error.rosterInvisible' : 'error.rosterMixed',
    params: { line: Number(row[1]) + 1 },
  };
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
      // Only the caller knows the run length; the server's wording is English.
      const count = params['count'];
      return count === undefined
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
      const issues = issuesOf(failure.body);
      for (const issue of issues) {
        const named = textIssueKey(issue);
        if (named)
          return { key: named.key, params: { ...params, ...named.params } };
      }
      const days = issues.find((issue) => issue.path === 'days');
      if (!days) return { key: 'error.invalid', params };
      // An empty list fails the lower bound; only the upper one is left.
      if (days.code !== 'too_small' && days.code !== 'too_big')
        return { key: 'error.invalid', params };
      return {
        key: days.code === 'too_small' ? 'error.noDays' : 'error.tooManyDays',
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
 * The text for a failed create. The server limits creation per network and
 * per hour, which "please wait a moment" understates; it names that limit
 * `creation_limit`, and a plain `rate_limited` stays the generic text.
 * `params` carries the run length (`count`) for a `no_block` refusal.
 */
export function createErrorMessage(
  error: unknown,
  t: Translate,
  params: Params = {}
): string {
  if (error instanceof ApiFailure && error.code === 'creation_limit')
    return t('error.createLimit');
  return errorMessage(error, t, params);
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
