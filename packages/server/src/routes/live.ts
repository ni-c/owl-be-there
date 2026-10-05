import type { FastifyInstance } from 'fastify';
import { limit, type AppContext } from '../context.js';
import { ApiError, networkKey } from '../http.js';
import { eventOr404 } from './events.js';

/**
 * `GET /api/events/:id/stream` — server-sent events for one event.
 *
 * The route takes the response over from Fastify, so the `onSend` header hook
 * never runs for it; it sets the same security headers itself. `X-Accel-Buffering`
 * tells nginx not to collect the stream into chunks.
 */
export function registerLiveRoutes(
  app: FastifyInstance,
  ctx: AppContext
): void {
  app.get<{ Params: { id: string } }>(
    '/api/events/:id/stream',
    {
      config: limit(ctx.config, 60, '1 minute'),
      // Fastify's HEAD twin would run this handler too: it hijacks the response
      // and never answers a HEAD, which Node writes no body for, while holding
      // a stream slot until the lifetime ends.
      exposeHeadRoute: false,
    },
    async (request, reply) => {
      const event = eventOr404(ctx, request.params.id);
      const key = networkKey(request.ip);
      if (!ctx.hub.hasRoom(event.id, key)) {
        throw new ApiError(
          429,
          'too_many_streams',
          'Too many live connections'
        );
      }
      reply.hijack();
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        ...ctx.headers,
      });
      ctx.hub.add(event.id, key, reply.raw, event.version);
    }
  );
}
