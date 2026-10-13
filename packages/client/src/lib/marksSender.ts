import { ApiFailure, NetworkFailure } from './api.ts';
import {
  PermanentSaveError,
  type SaveRequest,
  type SendResult,
} from './saveQueue.ts';

/**
 * The send function of a participant's {@link SaveQueue}: the request goes out
 * with only the days that are candidates right now, and failures are sorted
 * into those worth retrying and those that are not.
 *
 * The organiser may remove a day between a stroke and its request, so the days
 * are filtered when the request is made, not when the stroke was. A day that
 * gets through anyway — the snapshot that removed it has not arrived yet — is
 * dropped by the server, not refused. A revision that has moved is no failure
 * either: the server answers 409 `stale` with the current one, which the queue
 * takes before it sends again.
 */
export function marksSender(options: {
  put(request: SaveRequest): Promise<SendResult>;
  candidates(): ReadonlySet<string>;
}): (request: SaveRequest) => Promise<SendResult> {
  return async (request) => {
    const candidates = options.candidates();
    const kept: SaveRequest = {
      baseRev: request.baseRev,
      yes: request.yes.filter((day) => candidates.has(day)),
      maybe: request.maybe.filter((day) => candidates.has(day)),
    };
    try {
      return await options.put(kept);
    } catch (failure) {
      if (failure instanceof NetworkFailure) throw failure;
      if (
        failure instanceof ApiFailure &&
        (failure.status === 429 || failure.status >= 500)
      )
        throw failure;
      throw new PermanentSaveError(
        failure instanceof ApiFailure ? failure.code : 'unknown'
      );
    }
  };
}
