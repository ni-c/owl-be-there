import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import { isId, LANGUAGES, RETENTION_DAYS, type Language } from '@owl/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { limit, type AppContext } from '../context.js';
import { snapshot } from '../db/repo.js';
import {
  defaultHead,
  eventHead,
  homePath,
  robotsTxt,
  sitemap,
} from '../pages.js';

/** `/api/instance` and `/api/health`: what the client and a monitor ask. */
export function registerInstanceRoutes(
  app: FastifyInstance,
  ctx: AppContext
): void {
  const { config } = ctx;

  app.get('/api/instance', async (_request, reply) =>
    reply.header('cache-control', 'no-cache').send({
      version: ctx.version,
      creationEnabled: config.creationEnabled,
      retentionDays: RETENTION_DAYS,
      logRetentionDays: config.logRetentionDays,
      backupRetentionDays: config.backupRetentionDays,
      operatorName: config.operatorName,
      operatorContact: config.operatorContact,
      imprintUrl: config.imprintUrl,
      publicUrl: config.publicUrl,
    })
  );

  // Unauthenticated and not rate limited, for the container healthcheck. It
  // asks the database something, so a locked or missing file shows up here.
  app.get('/api/health', async (_request, reply) => {
    ctx.db.get('SELECT 1');
    return reply.header('cache-control', 'no-store').send({ ok: true });
  });
}

/**
 * The client: its static files, and `index.html` with the right head for every
 * page. Anything under `/api` that matched no route is a JSON 404; any other
 * unknown path is the app's own "not found" page, with a 404 status.
 */
export async function registerSite(
  app: FastifyInstance,
  ctx: AppContext
): Promise<void> {
  const { template, config } = ctx;
  const page = (
    reply: FastifyReply,
    head: string,
    status = 200,
    language: Language = 'en'
  ): FastifyReply =>
    reply
      .code(status)
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'no-cache')
      .send(template!.render(head, language));

  if (template && config.clientDir) {
    app.get('/', async (_request, reply) =>
      page(reply, defaultHead(config.publicUrl, '/', { alternates: true }))
    );
    // The start page once per language, so search engines find each one.
    for (const language of LANGUAGES) {
      const path = homePath(language);
      app.get(path, async (_request, reply) =>
        page(
          reply,
          defaultHead(config.publicUrl, path, { language, alternates: true }),
          200,
          language
        )
      );
    }
    app.get('/robots.txt', async (_request, reply) =>
      reply
        .header('content-type', 'text/plain; charset=utf-8')
        .header('cache-control', 'no-cache')
        .send(robotsTxt(config.publicUrl))
    );
    app.get('/sitemap.xml', async (_request, reply) =>
      reply
        .header('content-type', 'application/xml; charset=utf-8')
        .header('cache-control', 'no-cache')
        .send(sitemap(config.publicUrl))
    );
    app.get('/privacy', async (_request, reply) =>
      page(reply, defaultHead(config.publicUrl, '/privacy'))
    );
    app.get<{ Params: { id: string } }>(
      '/e/:id',
      // The same limit as the API read: each request builds a whole snapshot.
      { config: limit(config, 600, '1 minute') },
      async (request, reply) => {
        // Reads only: a crawler fetching a preview must not keep an event alive.
        const data = isId(request.params.id)
          ? snapshot(ctx.db, request.params.id)
          : null;
        reply.header('x-robots-tag', 'noindex, nofollow');
        return data
          ? page(
              reply,
              eventHead(config.publicUrl, data),
              200,
              data.event.language
            )
          : page(
              reply,
              defaultHead(config.publicUrl, request.url.split('?')[0]!),
              404
            );
      }
    );

    // Without `index: false`: that option decides which error a directory
    // produces, and with it `/` would answer 403 instead of reaching the
    // route above. The route above wins anyway, being more specific.
    await app.register(fastifyStatic, {
      root: config.clientDir,
      // The built client has no dotfiles; anything that looks like one is not
      // meant to be served, should CLIENT_DIR ever point wider.
      dotfiles: 'deny',
      setHeaders: (res, path) => {
        res.header(
          'cache-control',
          path.includes(`${join('/', 'assets')}/`)
            ? 'public, max-age=31536000, immutable'
            : 'no-cache'
        );
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api') || !template) {
      return reply
        .code(404)
        .send({ error: 'not_found', message: 'No such endpoint' });
    }
    return page(
      reply,
      defaultHead(config.publicUrl, request.url.split('?')[0]!),
      404
    );
  });
}

/** Whether a directory holds a built client. */
export function hasClient(dir: string | null): boolean {
  return dir !== null && existsSync(join(dir, 'index.html'));
}
