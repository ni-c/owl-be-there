import { randomInt } from 'node:crypto';
import {
  addDays,
  buildIcs,
  candidateBlocks,
  checkCandidateDays,
  compareISODate,
  CreateEventBody,
  isId,
  isLanguage,
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
  findParticipantByKey,
  getDays,
  getEvent,
  insertEvent,
  setStatus,
  snapshot,
  updateEvent,
  type EventRow,
  type NewParticipant,
} from '../db/repo.js';
import { ApiError, networkKey, notFound, parseBody } from '../http.js';

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

/**
 * The last day a new candidate day may be: about five years ahead. The client
 * counts the horizon from its local date, which is a day ahead of UTC in
 * UTC+14, so the server allows one day more than the limit says.
 */
export function latestDay(ctx: AppContext): ISODate {
  return addDays(todayUTC(new Date(ctx.clock.now())), LIMITS.horizon + 1);
}

function checkDays(
  days: readonly ISODate[],
  earliest: ISODate | null,
  latest: ISODate | null,
  duration: number
): void {
  const problem = checkCandidateDays(days, earliest, latest);
  if (problem !== null) throw new ApiError(400, 'invalid_days', problem);
  if (candidateBlocks(days, duration).length === 0) {
    throw new ApiError(
      400,
      'no_block',
      `No ${duration} consecutive candidate days to choose from`
    );
  }
}

/** Whether two lists hold the same days, in any order. */
function sameDays(a: readonly ISODate[], b: readonly ISODate[]): boolean {
  const left = new Set(a);
  return left.size === new Set(b).size && b.every((day) => left.has(day));
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
 * per-address limit — a botnet has many addresses. One network (an address or
 * an IPv6 /48) may take only a tenth of it, so a single rented prefix cannot
 * use it all up and lock everyone else out. Kept in memory, like every other
 * limit; the map holds at most as many networks as the ceiling allows events.
 */
export class HourlyCeiling {
  private windowStart = 0;
  private count = 0;
  private readonly perNetwork = new Map<string, number>();

  allow(now: number, max: number, network: string): boolean {
    // A clock stepped back (now < windowStart) would keep the window shut for
    // as long as the step, so it counts as an expired window too.
    if (now < this.windowStart || now - this.windowStart >= 3_600_000) {
      this.windowStart = now;
      this.count = 0;
      this.perNetwork.clear();
    }
    const share = Math.max(1, Math.floor(max / 10));
    const used = this.perNetwork.get(network) ?? 0;
    if (this.count >= max || used >= share) return false;
    this.count += 1;
    this.perNetwork.set(network, used + 1);
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
      checkDays(days, earliestDay(ctx), latestDay(ctx), body.durationDays);
      if (
        !ceiling.allow(
          ctx.clock.now(),
          300 * config.rateLimitMultiplier,
          networkKey(request.ip)
        )
      ) {
        throw new ApiError(
          429,
          'rate_limited',
          'Too many new events right now'
        );
      }
      if (
        countEvents(ctx.db) >= config.maxEvents ||
        (config.maxDbBytes !== null && ctx.db.sizeBytes() >= config.maxDbBytes)
      ) {
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
        if (!sameDays(body.baseDays!, current)) {
          throw new ApiError(
            409,
            'days_changed',
            'The days changed since you started editing'
          );
        }
        // Days that have passed may stay; only new ones must lie ahead, and
        // not too far.
        const existing = new Set(current);
        const added = days.filter((day) => !existing.has(day));
        if (added.some((day) => compareISODate(day, earliestDay(ctx)) < 0)) {
          throw new ApiError(400, 'invalid_days', 'past');
        }
        if (added.some((day) => compareISODate(day, latestDay(ctx)) > 0)) {
          throw new ApiError(400, 'invalid_days', 'too_far');
        }
      }
      checkDays(days, null, null, duration);
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

  /**
   * Whether the organiser key in the request is this event's. The client asks
   * before it lets a key from a link replace the one it already holds, so a
   * link with a made-up key cannot cost the organiser their access.
   */
  app.get<IdParams>(
    '/api/events/:id/admin',
    { config: limit(config, 30, '1 minute') },
    async (request, reply) => {
      const event = eventOr404(ctx, request.params.id);
      requireAdmin(request, event);
      return reply.code(204).send();
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
      // Names already there are skipped, so only the new ones count.
      const entries = rosterEntries(body.names).filter(
        (entry) => !findParticipantByKey(ctx.db, event.id, entry.nameKey)
      );
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
            SERVER_TEXTS[isLanguage(event.language) ? event.language : 'en']
              .calendarNote,
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
