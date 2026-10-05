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
 * The organiser may remove a day between a stroke and its request. The server
 * refuses marks on a day that is no longer a candidate (`invalid_marks`), so
 * the days are filtered when the request is made, not when the stroke was. If
 * the server still refuses — the snapshot that removed the day has not arrived
 * yet — that is a matter of time, not a verdict on the marks: the snapshot is
 * fetched and the queue retries.
 */
export function marksSender(options: {
  put(request: SaveRequest, keepalive: boolean): Promise<SendResult>;
  candidates(): ReadonlySet<string>;
  refresh(): void;
}): (request: SaveRequest, keepalive: boolean) => Promise<SendResult> {
  return async (request, keepalive) => {
    const candidates = options.candidates();
    const kept: SaveRequest = {
      baseRev: request.baseRev,
      yes: request.yes.filter((day) => candidates.has(day)),
      maybe: request.maybe.filter((day) => candidates.has(day)),
    };
    try {
      return await options.put(kept, keepalive);
    } catch (failure) {
      if (failure instanceof NetworkFailure) throw failure;
      if (failure instanceof ApiFailure) {
        if (failure.code === 'invalid_marks') {
          options.refresh();
          throw failure;
        }
        if (failure.status === 429 || failure.status >= 500) throw failure;
      }
      throw new PermanentSaveError(
        failure instanceof ApiFailure ? failure.code : 'unknown'
      );
    }
  };
}
