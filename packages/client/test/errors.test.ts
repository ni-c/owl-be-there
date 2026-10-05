import { LIMITS } from '@owl/shared';
import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en.ts';
import { translator } from '../src/i18n/index.tsx';
import { ApiFailure, NetworkFailure } from '../src/lib/api.ts';
import {
  errorMessage,
  isForbidden,
  sessionRevoked,
} from '../src/lib/errors.ts';
import { PermanentSaveError } from '../src/lib/saveQueue.ts';

const t = translator('en').t;
const failure = (
  status: number,
  code: string,
  message = code,
  body: unknown = null
) => new ApiFailure(status, code, message, body);

describe('errorMessage for the codes the server sends', () => {
  it('names the codes that used to fall through to the generic text', () => {
    expect(errorMessage(failure(503, 'busy'), t)).toBe(en['error.busy']);
    expect(errorMessage(failure(409, 'changed'), t)).toBe(en['error.changed']);
    expect(errorMessage(failure(404, 'not_found'), t)).toBe(
      en['error.generic']
    );
    expect(errorMessage(failure(400, 'invalid_block'), t)).toBe(
      en['error.daysChanged']
    );
  });

  it('tells how short a password may be at the shortest', () => {
    expect(errorMessage(failure(400, 'password_too_short'), t)).toBe(
      `At least ${LIMITS.passwordMin} characters, please.`
    );
  });

  it('says no_block with the run length the caller gives', () => {
    expect(errorMessage(failure(400, 'no_block'), t, { count: 4 })).toBe(
      'There are no 4 days in a row to choose from.'
    );
  });

  it('reads the run length from the server’s message when the caller gives none', () => {
    const error = failure(
      400,
      'no_block',
      'No 12 consecutive candidate days to choose from'
    );
    expect(errorMessage(error, t)).toBe(
      'There are no 12 days in a row to choose from.'
    );
  });

  it('does not show a placeholder when it has no run length at all', () => {
    expect(errorMessage(failure(400, 'no_block', 'something else'), t)).toBe(
      en['error.generic']
    );
    expect(errorMessage(failure(400, 'no_block', ''), t)).toBe(
      en['error.generic']
    );
  });

  it('maps invalid_days by the problem its message names', () => {
    const days = (message: string) => failure(400, 'invalid_days', message);
    expect(errorMessage(days('past'), t)).toBe(en['error.past']);
    expect(errorMessage(days('too_far'), t)).toBe(en['error.tooFar']);
    expect(errorMessage(days('span'), t)).toBe(en['error.rangeTooLong']);
    // Problems a person cannot cause through the screens.
    expect(errorMessage(days('unsorted'), t)).toBe(en['error.invalid']);
    expect(errorMessage(days(''), t)).toBe(en['error.invalid']);
  });

  it('maps validation_failed on the day list to its count, others to the general text', () => {
    const invalid = (issues: unknown) =>
      failure(400, 'validation_failed', 'The request is not valid', {
        error: 'validation_failed',
        issues,
      });
    expect(
      errorMessage(
        invalid([
          {
            path: 'days',
            message: 'Too big: expected array to have <=186 items',
          },
        ]),
        t
      )
    ).toBe(`At most ${LIMITS.days} days.`);
    expect(
      errorMessage(
        invalid([
          {
            path: 'days',
            message: 'Too small: expected array to have >=1 items',
          },
        ]),
        t
      )
    ).toBe(en['error.noDays']);
    expect(
      errorMessage(invalid([{ path: 'title', message: 'Required' }]), t)
    ).toBe(en['error.invalid']);
    // A day that is no date has a path of its own, below the list.
    expect(
      errorMessage(invalid([{ path: 'days.3', message: 'Not a date' }]), t)
    ).toBe(en['error.invalid']);
  });

  it('copes with a validation_failed that carries no usable issues', () => {
    for (const body of [
      null,
      {},
      { issues: 'x' },
      { issues: [null, 3, { path: 1 }] },
      { issues: [] },
    ]) {
      expect(
        errorMessage(failure(400, 'validation_failed', '', body), t),
        JSON.stringify(body)
      ).toBe(en['error.invalid']);
    }
  });

  it('reads a failed save the way it reads the failure it carries', () => {
    expect(errorMessage(new PermanentSaveError('closed'), t)).toBe(
      en['who.closed']
    );
    expect(errorMessage(new PermanentSaveError('forbidden'), t)).toBe(
      en['error.forbidden']
    );
    expect(errorMessage(new PermanentSaveError('unknown'), t)).toBe(
      en['error.generic']
    );
  });

  it('keeps the offline text for a network failure and the generic one for the rest', () => {
    expect(errorMessage(new NetworkFailure(new Error('x')), t)).toBe(
      en['error.offline']
    );
    expect(errorMessage(null, t)).toBe(en['error.generic']);
    expect(errorMessage(undefined, t)).toBe(en['error.generic']);
  });
});

describe('isForbidden', () => {
  it('is true for a refusal of the link, from the API or from a save', () => {
    expect(isForbidden(failure(403, 'forbidden'))).toBe(true);
    expect(isForbidden(new PermanentSaveError('forbidden'))).toBe(true);
  });

  it('is false for everything else', () => {
    expect(isForbidden(failure(409, 'closed'))).toBe(false);
    expect(isForbidden(new PermanentSaveError('closed'))).toBe(false);
    expect(isForbidden(new NetworkFailure(new Error('x')))).toBe(false);
    expect(isForbidden(new Error('forbidden'))).toBe(false);
    expect(isForbidden(null)).toBe(false);
  });
});

describe('sessionRevoked', () => {
  const forbidden = new PermanentSaveError('forbidden');

  it("is true when the refusal met the participant's own token", () => {
    expect(sessionRevoked(forbidden, { participant: 'tok' })).toBe(true);
    expect(
      sessionRevoked(failure(403, 'forbidden'), { participant: 'tok' })
    ).toBe(true);
  });

  it('is false when the organiser filled in with the organiser key', () => {
    expect(sessionRevoked(forbidden, { admin: 'key' })).toBe(false);
    expect(
      sessionRevoked(forbidden, { admin: 'key', participant: 'tok' })
    ).toBe(false);
  });

  it('is false without any token, or with an empty one', () => {
    expect(sessionRevoked(forbidden, {})).toBe(false);
    expect(sessionRevoked(forbidden, { participant: null })).toBe(false);
    expect(sessionRevoked(forbidden, { participant: '' })).toBe(false);
  });

  it('is false for any other failure, however good the token', () => {
    expect(
      sessionRevoked(new PermanentSaveError('closed'), { participant: 'tok' })
    ).toBe(false);
    expect(sessionRevoked(null, { participant: 'tok' })).toBe(false);
    expect(sessionRevoked(undefined, { participant: 'tok' })).toBe(false);
  });
});
