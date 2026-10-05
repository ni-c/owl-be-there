import { ADMIN_HEADER, PARTICIPANT_HEADER } from '@owl/shared';
import type { FastifyRequest } from 'fastify';
import type { EventRow, ParticipantRow } from '../db/repo.js';
import { header } from '../http.js';
import { readParticipantToken, verifyAdminToken } from './tokens.js';

/** Whether the request carries the organiser's key to this event. */
export function isAdmin(request: FastifyRequest, event: EventRow): boolean {
  return verifyAdminToken(header(request, ADMIN_HEADER), event.admin_hash);
}

/**
 * Whether the request carries a valid token for this very participant, of the
 * current generation — a token from before the last password change is dead.
 */
export function isParticipant(
  request: FastifyRequest,
  secret: Buffer,
  event: EventRow,
  participant: ParticipantRow
): boolean {
  const claim = readParticipantToken(
    secret,
    event.id,
    header(request, PARTICIPANT_HEADER)
  );
  return (
    claim !== null &&
    claim.participantId === participant.id &&
    claim.generation === participant.token_gen
  );
}
