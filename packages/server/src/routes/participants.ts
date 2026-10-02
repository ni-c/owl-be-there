import { randomInt } from 'node:crypto';
import {
  isId,
  LIMITS,
  makeId,
  MarksBody,
  nameKey,
  SessionBody,
  UpdateParticipantBody,
} from '@owl/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { isAdmin, isParticipant } from '../auth/access.js';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import { signParticipantToken } from '../auth/tokens.js';
import { limit, type AppContext } from '../context.js';
import {
  countParticipants,
  deleteParticipant,
  findParticipantByKey,
  getDays,
  getParticipant,
  insertParticipant,
  replaceMarks,
  snapshot,
  statusOf,
  updateParticipant,
  type EventRow,
  type ParticipantRow,
} from '../db/repo.js';
import { ApiError, parseBody } from '../http.js';
import { eventOr404, published } from './events.js';

type ParticipantParams = { Params: { id: string; pid: string } };

function participantOr404(
  ctx: AppContext,
  event: EventRow,
  pid: string
): ParticipantRow {
  const participant = isId(pid)
    ? getParticipant(ctx.db, event.id, pid)
    : undefined;
  if (!participant) throw new ApiError(404, 'not_found', 'No such participant');
  return participant;
}

/**
 * Who may change a participant: the organiser, or the participant with a
 * current token. While the poll is closed only the organiser may.
 */
function authorize(
  ctx: AppContext,
  request: FastifyRequest,
  event: EventRow,
  participant: ParticipantRow
): 'admin' | 'self' {
  if (isAdmin(request, event)) return 'admin';
  if (!isParticipant(request, ctx.secret, event, participant)) {
    throw new ApiError(403, 'forbidden', 'Not your entry');
  }
  if (statusOf(event) !== 'open') {
    throw new ApiError(409, 'closed', 'The poll is closed');
  }
  return 'self';
}

export function registerParticipantRoutes(
  app: FastifyInstance,
  ctx: AppContext
): void {
  const { config } = ctx;
  const token = (event: EventRow, participant: ParticipantRow): string =>
    signParticipantToken(
      ctx.secret,
      event.id,
      participant.id,
      participant.token_gen
    );

  /**
   * "Who are you?" — a name, and a password if the name has one.
   *
   * A new name becomes a participant. A known name without a password is
   * simply that person again; given a password now, it becomes protected. A
   * protected name needs its password.
   */
  app.post<{ Params: { id: string } }>(
    '/api/events/:id/session',
    { config: limit(config, 10, '5 minutes') },
    async (request) => {
      const event = eventOr404(ctx, request.params.id);
      const body = parseBody(SessionBody, request.body);
      const key = nameKey(body.name);
      const existing = findParticipantByKey(ctx.db, event.id, key);
      const open = statusOf(event) === 'open';

      if (existing) {
        if (existing.password_hash !== null) {
          if (body.password === undefined) {
            throw new ApiError(
              401,
              'password_required',
              'This name is protected'
            );
          }
          if (!(await verifyPassword(body.password, existing.password_hash))) {
            throw new ApiError(
              401,
              'wrong_password',
              'That password is not right'
            );
          }
          return {
            participantId: existing.id,
            token: token(event, existing),
            created: false,
          };
        }
        if (body.password !== undefined && open) {
          if (body.password.length < LIMITS.passwordMin) {
            throw new ApiError(
              400,
              'password_too_short',
              'Passwords need at least 4 characters'
            );
          }
          const hash = await hashPassword(body.password);
          const updated = updateParticipant(
            ctx.db,
            event.id,
            existing.id,
            { passwordHash: hash },
            ctx.clock.now()
          );
          published(ctx, event.id);
          return {
            participantId: updated.id,
            token: token(event, updated),
            created: false,
          };
        }
        return {
          participantId: existing.id,
          token: token(event, existing),
          created: false,
        };
      }

      if (!open) throw new ApiError(409, 'closed', 'The poll is closed');
      if (countParticipants(ctx.db, event.id) >= LIMITS.participants) {
        throw new ApiError(
          409,
          'full',
          'This event has as many people as it can hold'
        );
      }
      if (
        body.password !== undefined &&
        body.password.length < LIMITS.passwordMin
      ) {
        throw new ApiError(
          400,
          'password_too_short',
          'Passwords need at least 4 characters'
        );
      }
      // Hashed before the transaction: scrypt is asynchronous, and nothing
      // asynchronous may happen inside one.
      const passwordHash =
        body.password === undefined ? null : await hashPassword(body.password);
      const created = insertParticipant(
        ctx.db,
        event.id,
        { id: makeId(randomInt), name: body.name, nameKey: key, passwordHash },
        ctx.clock.now()
      );
      published(ctx, event.id);
      return {
        participantId: created.id,
        token: token(event, created),
        created: true,
      };
    }
  );

  app.put<ParticipantParams>(
    '/api/events/:id/participants/:pid/marks',
    { config: limit(config, 120, '1 minute') },
    async (request, reply) => {
      const event = eventOr404(ctx, request.params.id);
      const participant = participantOr404(ctx, event, request.params.pid);
      authorize(ctx, request, event, participant);
      const body = parseBody(MarksBody, request.body);
      const candidates = new Set(
        getDays(ctx.db, event.id).map((row) => row.day)
      );
      const yes = [...new Set(body.yes)].sort();
      const maybe = [...new Set(body.maybe)].sort();
      const both = new Set(yes);
      if (
        [...yes, ...maybe].some((day) => !candidates.has(day)) ||
        maybe.some((day) => both.has(day))
      ) {
        throw new ApiError(
          400,
          'invalid_marks',
          'Marks must be on candidate days, each once'
        );
      }
      const result = replaceMarks(
        ctx.db,
        event.id,
        participant.id,
        body.baseRev,
        yes,
        maybe,
        ctx.clock.now()
      );
      if (!result.ok) {
        return reply.code(409).send({
          error: 'stale',
          rev: result.rev,
          yes: result.yes,
          maybe: result.maybe,
        });
      }
      ctx.hub.changed(event.id, result.version);
      return { rev: result.rev, version: result.version };
    }
  );

  app.patch<ParticipantParams>(
    '/api/events/:id/participants/:pid',
    { config: limit(config, 60, '1 minute') },
    async (request) => {
      const event = eventOr404(ctx, request.params.id);
      const participant = participantOr404(ctx, event, request.params.pid);
      const actor = authorize(ctx, request, event, participant);
      const body = parseBody(UpdateParticipantBody, request.body);
      let name: { name: string; nameKey: string } | undefined;
      if (body.name !== undefined) {
        const key = nameKey(body.name);
        const other = findParticipantByKey(ctx.db, event.id, key);
        if (other && other.id !== participant.id) {
          throw new ApiError(
            409,
            'name_taken',
            'Someone already has that name'
          );
        }
        name = { name: body.name, nameKey: key };
      }
      const passwordHash =
        body.password === undefined
          ? undefined
          : body.password === null
            ? null
            : await hashPassword(body.password);
      const updated = updateParticipant(
        ctx.db,
        event.id,
        participant.id,
        {
          ...(name && { name }),
          ...(body.note !== undefined && { note: body.note }),
          ...(passwordHash !== undefined && { passwordHash }),
        },
        ctx.clock.now()
      );
      published(ctx, event.id);
      const view = snapshot(ctx.db, event.id)!.participants.find(
        (p) => p.id === updated.id
      )!;
      return {
        participant: view,
        // A changed password revokes the old token; the person who changed it
        // gets the new one. The organiser resetting someone's password does not.
        token:
          actor === 'self' && passwordHash !== undefined
            ? token(event, updated)
            : null,
      };
    }
  );

  app.delete<ParticipantParams>(
    '/api/events/:id/participants/:pid',
    { config: limit(config, 60, '1 minute') },
    async (request, reply) => {
      const event = eventOr404(ctx, request.params.id);
      const participant = participantOr404(ctx, event, request.params.pid);
      authorize(ctx, request, event, participant);
      deleteParticipant(ctx.db, event.id, participant.id, ctx.clock.now());
      published(ctx, event.id);
      return reply.code(204).send();
    }
  );
}
