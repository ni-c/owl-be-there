import type { FastifyInstance } from 'fastify';
import { limit, type AppContext } from '../context.js';
import { ApiError, clientKey } from '../http.js';
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
    { config: limit(ctx.config, 60, '1 minute') },
    async (request, reply) => {
      const event = eventOr404(ctx, request.params.id);
      const key = clientKey(request.ip);
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
