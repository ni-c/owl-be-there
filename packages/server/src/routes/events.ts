import { randomInt } from 'node:crypto';
import {
  addDays,
  buildIcs,
  candidateBlocks,
  checkCandidateDays,
  compareISODate,
  CreateEventBody,
  isId,
  LIMITS,
  makeId,
  nameKey,
  normalizeDays,
  RosterBody,
  SERVER_TEXTS,
  StatusBody,
  todayUTC,
  UpdateEventBody,
  type ISODate,
} from '@owl/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isAdmin } from '../auth/access.js';
import { hashAdminToken, newAdminToken } from '../auth/tokens.js';
import { limit, type AppContext } from '../context.js';
import {
  addRoster,
  blockFits,
  countEvents,
  countParticipants,
  deleteEvent,
  getDays,
  getEvent,
  insertEvent,
  setStatus,
  snapshot,
  updateEvent,
  type EventRow,
  type NewParticipant,
} from '../db/repo.js';
import { ApiError, notFound, parseBody } from '../http.js';

type IdParams = { Params: { id: string } };

/** The event an `:id` names, or a 404 — a malformed id never reaches the database. */
export function eventOr404(ctx: AppContext, id: string): EventRow {
  const event = isId(id) ? getEvent(ctx.db, id) : undefined;
  if (!event) throw notFound();
  return event;
}

function requireAdmin(request: FastifyRequest, event: EventRow): void {
  if (!isAdmin(request, event)) {
    throw new ApiError(403, 'forbidden', 'This needs the organiser link');
  }
}

/**
 * The first day a new candidate day may be: yesterday in UTC. The server does
 * not know the organiser's time zone; one day of slack covers everyone from
 * UTC-12 to UTC+14.
 */
export function earliestDay(ctx: AppContext): ISODate {
  return addDays(todayUTC(new Date(ctx.clock.now())), -1);
}

function checkDays(
  days: readonly ISODate[],
  earliest: ISODate | null,
  duration: number
): void {
  const problem = checkCandidateDays(days, earliest);
  if (problem !== null) throw new ApiError(400, 'invalid_days', problem);
  if (candidateBlocks(days, duration).length === 0) {
    throw new ApiError(
      400,
      'no_block',
      `No ${duration} consecutive candidate days to choose from`
    );
  }
}

/** Roster names, without duplicates by name key, as new participants. */
export function rosterEntries(names: readonly string[]): NewParticipant[] {
  const seen = new Set<string>();
  const entries: NewParticipant[] = [];
  for (const name of names) {
    const key = nameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ id: makeId(randomInt), name, nameKey: key });
  }
  return entries;
}

/** Answer with the event as everyone sees it now. */
export function sendSnapshot(
  ctx: AppContext,
  reply: FastifyReply,
  id: string
): FastifyReply {
  const data = snapshot(ctx.db, id);
  if (!data) throw notFound();
  return reply.header('cache-control', 'private, no-cache').send(data);
}

/** Tell the open streams that the event moved on. */
export function published(ctx: AppContext, id: string): void {
  const event = getEvent(ctx.db, id);
  if (event) ctx.hub.changed(id, event.version);
}

/**
 * Creation also has a ceiling for the whole instance per hour, on top of the
 * per-address limit — a botnet has many addresses. Kept in memory, like every
 * other limit.
 */
class HourlyCeiling {
  private windowStart = 0;
  private count = 0;

  allow(now: number, max: number): boolean {
    if (now - this.windowStart >= 3_600_000) {
      this.windowStart = now;
      this.count = 0;
    }
    if (this.count >= max) return false;
    this.count += 1;
    return true;
  }
}

export function registerEventRoutes(
  app: FastifyInstance,
  ctx: AppContext
): void {
  const { config } = ctx;
  const ceiling = new HourlyCeiling();

  app.post(
    '/api/events',
    { config: limit(config, 10, '1 hour') },
    async (request, reply) => {
      if (!config.creationEnabled) {
        throw new ApiError(
          503,
          'creation_disabled',
          'This instance does not take new events'
        );
      }
      const body = parseBody(CreateEventBody, request.body);
      const days = normalizeDays(body.days);
      checkDays(days, earliestDay(ctx), body.durationDays);
      if (!ceiling.allow(ctx.clock.now(), 300 * config.rateLimitMultiplier)) {
        throw new ApiError(
          429,
          'rate_limited',
          'Too many new events right now'
        );
      }
      if (countEvents(ctx.db) >= config.maxEvents) {
        throw new ApiError(503, 'capacity', 'This instance is full');
      }
      const id = makeId(randomInt);
      const adminToken = newAdminToken();
      insertEvent(
        ctx.db,
        {
          id,
          adminHash: hashAdminToken(adminToken),
          title: body.title,
          description: body.description || null,
          location: body.location || null,
          emoji: body.emoji,
          creatorName: body.creatorName || null,
          language: body.language,
          durationDays: body.durationDays,
          minCount: body.minCount ?? null,
          days,
          roster: rosterEntries(body.roster ?? []),
        },
        ctx.clock.now()
      );
      return reply.code(201).send({ id, adminToken });
    }
  );

  app.get<IdParams>(
    '/api/events/:id',
    { config: limit(config, 600, '1 minute') },
    async (request, reply) => {
      const event = eventOr404(ctx, request.params.id);
      const etag = `"v${event.version}"`;
      reply.header('etag', etag).header('cache-control', 'private, no-cache');
      if (request.headers['if-none-match'] === etag)
        return reply.code(304).send();
      return reply.send(snapshot(ctx.db, event.id));
    }
  );

  app.patch<IdParams>(
    '/api/events/:id',
    { config: limit(config, 60, '1 minute') },
    async (request, reply) => {
      const event = eventOr404(ctx, request.params.id);
      requireAdmin(request, event);
      const body = parseBody(UpdateEventBody, request.body);
      const current = getDays(ctx.db, event.id).map((row) => row.day);
      const days = body.days ? normalizeDays(body.days) : current;
      const duration = body.durationDays ?? event.duration_days;
      if (body.days) {
        // Days that have passed may stay; only new ones must lie ahead.
        const existing = new Set(current);
        const earliest = earliestDay(ctx);
        if (
          days.some(
            (day) => !existing.has(day) && compareISODate(day, earliest) < 0
          )
        ) {
          throw new ApiError(400, 'invalid_days', 'past');
        }
      }
      checkDays(days, null, duration);
      updateEvent(
        ctx.db,
        event.id,
        {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && {
            description: body.description || null,
          }),
          ...(body.location !== undefined && {
            location: body.location || null,
          }),
          ...(body.emoji !== undefined && { emoji: body.emoji }),
          ...(body.creatorName !== undefined && {
            creatorName: body.creatorName || null,
          }),
          ...(body.durationDays !== undefined && {
            durationDays: body.durationDays,
          }),
          ...(body.minCount !== undefined && { minCount: body.minCount }),
          ...(body.days !== undefined && { days }),
        },
        ctx.clock.now()
      );
      published(ctx, event.id);
      return sendSnapshot(ctx, reply, event.id);
    }
  );

  app.put<IdParams>(
    '/api/events/:id/status',
    { config: limit(config, 60, '1 minute') },
    async (request, reply) => {
      const event = eventOr404(ctx, request.params.id);
      requireAdmin(request, event);
      const body = parseBody(StatusBody, request.body);
      if (body.status === 'finalized') {
        if (!blockFits(ctx.db, event, body.start)) {
          throw new ApiError(
            400,
            'invalid_block',
            'That is not a block of candidate days'
          );
        }
        const end = addDays(body.start, event.duration_days - 1);
        setStatus(
          ctx.db,
          event.id,
          { start: body.start, end },
          ctx.clock.now()
        );
      } else {
        setStatus(ctx.db, event.id, body.status, ctx.clock.now());
      }
      published(ctx, event.id);
      return sendSnapshot(ctx, reply, event.id);
    }
  );

  app.delete<IdParams>(
    '/api/events/:id',
    { config: limit(config, 60, '1 minute') },
    async (request, reply) => {
      const event = eventOr404(ctx, request.params.id);
      requireAdmin(request, event);
      deleteEvent(ctx.db, event.id);
      ctx.hub.deleted(event.id);
      ctx.db.checkpoint();
      return reply.code(204).send();
    }
  );

  app.post<IdParams>(
    '/api/events/:id/participants',
    { config: limit(config, 60, '1 minute') },
    async (request, reply) => {
      const event = eventOr404(ctx, request.params.id);
      requireAdmin(request, event);
      const body = parseBody(RosterBody, request.body);
      const entries = rosterEntries(body.names);
      if (
        countParticipants(ctx.db, event.id) + entries.length >
        LIMITS.participants
      ) {
        throw new ApiError(
          409,
          'full',
          'That is more people than an event can hold'
        );
      }
      addRoster(ctx.db, event.id, entries, ctx.clock.now());
      published(ctx, event.id);
      return sendSnapshot(ctx, reply, event.id);
    }
  );

  app.get<IdParams>(
    '/api/events/:id/calendar.ics',
    { config: limit(config, 600, '1 minute') },
    async (request, reply) => {
      const event = eventOr404(ctx, request.params.id);
      if (event.final_start === null || event.final_end === null) {
        throw new ApiError(404, 'not_decided', 'No date has been chosen yet');
      }
      const ics = buildIcs(
        {
          uid: `${event.id}@owl-be-there`,
          title: event.title,
          description:
            SERVER_TEXTS[event.language === 'de' ? 'de' : 'en'].calendarNote,
          location: event.location,
          start: event.final_start,
          end: event.final_end,
          url: `${config.publicUrl}/e/${event.id}`,
        },
        new Date(ctx.clock.now())
      );
      return reply
        .header('content-type', 'text/calendar; charset=utf-8')
        .header(
          'content-disposition',
          'attachment; filename="owl-be-there.ics"'
        )
        .header('cache-control', 'private, no-cache')
        .send(ics);
    }
  );
}
