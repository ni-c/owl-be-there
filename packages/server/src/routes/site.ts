import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import fastifyStatic from '@fastify/static';
import { isId, LANGUAGES, RETENTION_DAYS, type Language } from '@owl/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { limit, type AppContext } from '../context.js';
import { snapshot } from '../db/repo.js';
import { PreviewBusy } from '../preview.js';
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
 * A page's path and the same with a trailing slash. The client's router takes
 * both, so a link shared either way must reach the same page, head included.
 */
const withSlash = (path: string): string[] =>
  path === '/' ? [path] : [path, `${path}/`];

/** Whether the request is for the API: `/api` itself or anything below it. */
const isApiPath = (url: string): boolean => /^\/api(?:[/?]|$)/.test(url);

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
    language: Language = 'en',
    cacheControl = 'no-cache'
  ): FastifyReply =>
    reply
      .code(status)
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', cacheControl)
      .send(template!.render(head, language));

  if (template && config.clientDir) {
    app.get('/', async (_request, reply) =>
      page(reply, defaultHead(config.publicUrl, '/', { alternates: true }))
    );
    // The start page once per language, so search engines find each one.
    for (const language of LANGUAGES) {
      const path = homePath(language);
      for (const url of withSlash(path)) {
        app.get(url, async (_request, reply) =>
          page(
            reply,
            defaultHead(config.publicUrl, path, { language, alternates: true }),
            200,
            language
          )
        );
      }
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
    for (const url of withSlash('/privacy')) {
      app.get(url, async (_request, reply) =>
        page(reply, defaultHead(config.publicUrl, '/privacy'))
      );
    }
    // GET and HEAD are one route, so they share one rate limit: Fastify's
    // automatic HEAD route would count on its own. The address with a slash is
    // a route of its own and counts on its own too.
    for (const url of withSlash('/e/:id'))
      app.route<{ Params: { id: string } }>({
        method: ['GET', 'HEAD'],
        url,
        // The same limit as the API read.
        config: limit(config, 600, '1 minute'),
        handler: async (request, reply) => {
          // Reads only: a crawler fetching a preview must not keep an event alive.
          const data = isId(request.params.id)
            ? snapshot(ctx.db, request.params.id)
            : null;
          reply.header('x-robots-tag', 'noindex, nofollow');
          // The head carries the event's title: for the browser alone, not for
          // a cache that others share.
          return data
            ? page(
                reply,
                eventHead(config.publicUrl, data),
                200,
                data.event.language,
                'private, no-cache'
              )
            : page(
                reply,
                defaultHead(config.publicUrl, request.url.split('?')[0]!),
                404
              );
        },
      });

    // The link-preview picture of an event. Reads only, like the page; the
    // renderer keeps each version once, so a crawler storm draws it once, and
    // it draws only so many new pictures a second, so a stream of changes
    // cannot keep the server busy.
    app.route<{ Params: { id: string } }>({
      method: ['GET', 'HEAD'],
      url: '/e/:id/og.png',
      config: limit(config, 120, '1 minute'),
      handler: async (request, reply) => {
        const data = isId(request.params.id)
          ? snapshot(ctx.db, request.params.id)
          : null;
        reply.header('x-robots-tag', 'noindex, nofollow');
        if (!data)
          return reply
            .code(404)
            .send({ error: 'not_found', message: 'No such event' });
        let png;
        try {
          png = await ctx.preview!.render(data);
        } catch (error) {
          if (!(error instanceof PreviewBusy)) throw error;
          return reply
            .code(503)
            .header('retry-after', String(error.retryAfter))
            .send({ error: 'busy', message: error.message });
        }
        return (
          reply
            .header('content-type', 'image/png')
            // A short while: the address carries the version, but a crawler
            // asking without it should not keep an old picture for long. The
            // picture shows the title and the heatmap, so no shared cache
            // keeps it past the event's deletion.
            .header('cache-control', 'private, max-age=300')
            .send(png)
        );
      },
    });

    // Without `index: false`: that option decides which error a directory
    // produces, and with it `/` would answer 403 instead of reaching the
    // route above. The route above wins anyway, being more specific.
    await app.register(fastifyStatic, {
      root: config.clientDir,
      // The built client has no dotfiles; anything that looks like one is not
      // meant to be served, should CLIENT_DIR ever point wider.
      dotfiles: 'deny',
      setHeaders: (res, path) => {
        // The hashed files under `assets/` of the client directory; where the
        // directory itself lies does not matter.
        const immutable =
          relative(config.clientDir!, path).split(sep)[0] === 'assets';
        res.header(
          'cache-control',
          immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
        );
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (isApiPath(request.url) || !template) {
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
