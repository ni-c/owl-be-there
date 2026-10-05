import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import rateLimit from '@fastify/rate-limit';
import { todayUTC } from '@owl/shared';
import Fastify, {
  LogController,
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
} from 'fastify';
import {
  DEFAULT_THROTTLE_LIMITS,
  PasswordThrottle,
  type ThrottleLimits,
} from './auth/throttle.js';
import { ConfigError, type Config } from './config.js';
import { systemClock, type AppContext, type Clock } from './context.js';
import { sweepExpired } from './db/repo.js';
import type { Db } from './db/sqlite.js';
import { ApiError, networkKey, ValidationError } from './http.js';
import { PageTemplate } from './pages.js';
import { PreviewRenderer, type RenderBudget } from './preview.js';
import { registerEventRoutes } from './routes/events.js';
import { registerLiveRoutes } from './routes/live.js';
import { registerParticipantRoutes } from './routes/participants.js';
import {
  hasClient,
  registerInstanceRoutes,
  registerSite,
} from './routes/site.js';
import { SseHub, type StreamLimits } from './sse.js';

export interface BuildAppOptions {
  config: Config;
  db: Db;
  secret: Buffer;
  clock?: Clock;
  /** A pino destination for the logs; tests pass one to read them. */
  logStream?: { write(line: string): void };
  streamLimits?: StreamLimits;
  heartbeatMs?: number;
  /** How long a request may take to arrive in full; tests shorten it. */
  requestTimeoutMs?: number;
  /** The ceiling on new link-preview pictures; tests tighten or lift it. */
  previewBudget?: RenderBudget | null;
  throttleLimits?: Partial<ThrottleLimits>;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Delete expired events; returns how many went. */
    sweep(): number;
    hub: SseHub;
  }
}

/** The server's own version, from its manifest. */
function readVersion(): string {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  ) as { version: string };
  return manifest.version;
}

/** How long a request may take to arrive in full, headers and body. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * An error as the log shows it: what pino's own serializer shows, but without
 * `rawPacket`. A request the parser refuses is logged at `trace` with the
 * bytes it received — the event link and the tokens in its headers.
 */
export function serializeError(error: Error): {
  [key: string]: unknown;
  type: string;
  message: string;
  stack: string;
} {
  const { rawPacket: _raw, ...rest } = error as Error & { rawPacket?: unknown };
  return {
    ...rest,
    type: error.constructor.name,
    message: error.message,
    stack: error.stack ?? '',
  };
}

/**
 * The content security policy. The app ships its own bundle and talks to
 * nothing else, so everything external is denied. Inline scripts are allowed
 * by hash only — see `inlineScriptHashes`. Styles need no exception: React
 * sets them through the CSSOM, which the policy does not restrict.
 */
export function contentSecurityPolicy(scriptHashes: readonly string[]): string {
  return [
    "default-src 'self'",
    ["script-src 'self'", ...scriptHashes].join(' '),
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
}

/**
 * The headers every response a handler or the framework's error path sends
 * carries. The live stream takes over its response and skips the `onSend`
 * hook, so it sets these itself from `ctx.headers`. A request Node refuses
 * before it reaches Fastify — a malformed request line — is answered by Node
 * alone and carries none.
 */
function securityHeaders(csp: string, https: boolean): Record<string, string> {
  return {
    'x-content-type-options': 'nosniff',
    // Event links are access keys; they must not travel on in a Referer.
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'permissions-policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'content-security-policy': csp,
    ...(https && { 'strict-transport-security': 'max-age=31536000' }),
  };
}

/**
 * The link-preview pictures, which other sites embed: `/og.png` and
 * `/e/:id/og.png`. They answer `cross-origin`, every other response
 * `same-origin`.
 */
const PICTURE_PATH = /^\/(?:e\/[^/?#]+\/)?og\.png(?:\?|$)/;

export async function buildApp(
  options: BuildAppOptions
): Promise<FastifyInstance> {
  const { config, db, secret } = options;
  const clock = options.clock ?? systemClock;
  const requestTimeout = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;

  if (config.clientDir !== null && !hasClient(config.clientDir)) {
    // Left unset, CLIENT_DIR means API only; a directory without a built
    // client is a typo or a missing mount, and would take the pages offline
    // while the health check stays green.
    throw new ConfigError([
      `CLIENT_DIR ${config.clientDir} does not hold a built client (no index.html)`,
    ]);
  }
  const template =
    config.clientDir !== null
      ? new PageTemplate(
          readFileSync(join(config.clientDir, 'index.html'), 'utf8')
        )
      : null;
  const hub = new SseHub(options.streamLimits, options.heartbeatMs);
  const csp = contentSecurityPolicy(template?.scriptHashes ?? []);
  const https = config.publicUrl.startsWith('https:');
  const headers = securityHeaders(csp, https);

  const app = Fastify({
    // Request logging is off: a request log is a list of IP addresses with
    // the event links they opened. What is logged — start-up, errors, sweeps
    // — carries neither.
    logger:
      config.logLevel === 'silent'
        ? false
        : {
            level: config.logLevel,
            serializers: { err: serializeError },
            ...(options.logStream && { stream: options.logStream }),
          },
    logController: new LogController({ disableRequestLogging: true }),
    // A URL the router cannot take (`/e/AbC%`) never reaches a handler or the
    // error handler below; without this it is answered with the framework's
    // own JSON and none of the security headers. The message names no path:
    // event links are access keys.
    frameworkErrors: (error, _request, reply) => {
      const status = error.statusCode === 414 ? 414 : 400;
      void (reply as FastifyReply)
        .code(status)
        .headers(headers)
        .send(
          status === 414
            ? { error: 'uri_too_long', message: 'The URL is too long' }
            : { error: 'bad_request', message: 'Malformed URL' }
        );
    },
    trustProxy: config.trustProxy,
    bodyLimit: 32 * 1024,
    // A body that stops arriving must not hold its connection, and with it
    // the shutdown, forever. A live stream is a response, not a request: it
    // is not timed. `connectionTimeout` stays off for the same reason.
    requestTimeout,
    http: {
      // Node ignores the request timeout while the headers timeout, a minute
      // by default, is the longer of the two.
      headersTimeout: requestTimeout,
      // Node looks for overdue requests this often, 30 seconds by default.
      connectionsCheckingInterval: Math.max(10, requestTimeout / 4),
    },
  });

  // JSON only. Without the plain-text parser, any other body is a 415 — and a
  // cross-site form can only send form encodings or plain text, so no request
  // a foreign page can forge without CORS reaches a handler.
  app.removeContentTypeParser('text/plain');

  const ctx: AppContext = {
    config,
    db,
    secret,
    clock,
    hub,
    template,
    preview: template
      ? new PreviewRenderer(
          config.clientDir,
          new URL(config.publicUrl).host,
          undefined,
          options.previewBudget === undefined
            ? {}
            : { budget: options.previewBudget }
        )
      : null,
    version: readVersion(),
    headers,
    throttle: new PasswordThrottle(clock, {
      ...DEFAULT_THROTTLE_LIMITS,
      ...options.throttleLimits,
      perNetwork:
        (options.throttleLimits?.perNetwork ??
          DEFAULT_THROTTLE_LIMITS.perNetwork) * config.rateLimitMultiplier,
    }),
  };

  app.addHook('onSend', async (request, reply, payload) => {
    reply.headers(ctx.headers);
    // Other sites embed the link-preview pictures; a browser would refuse
    // them under `same-origin`.
    if (PICTURE_PATH.test(request.url)) {
      reply.header('cross-origin-resource-policy', 'cross-origin');
    }
    return payload;
  });

  await app.register(rateLimit, {
    global: false,
    // An address or an IPv6 /48, in memory only. A /64 is what one household
    // is handed, but whoever rents a /48 holds 65,536 of them and would get
    // every limit that many times over.
    keyGenerator: (request) => networkKey(request.ip),
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'rate_limited',
      message: `Too many requests; try again in ${context.after}`,
    }),
  });

  app.setErrorHandler((error: FastifyError | ApiError, _request, reply) => {
    if (error instanceof ValidationError) {
      return reply.code(400).send({
        error: error.code,
        message: error.message,
        issues: error.issues,
      });
    }
    if (error instanceof ApiError) {
      return reply
        .code(error.statusCode)
        .send({ error: error.code, message: error.message });
    }
    const status = error.statusCode ?? 500;
    if (status === 429) {
      return reply
        .code(429)
        .send({ error: 'rate_limited', message: error.message });
    }
    if (status >= 400 && status < 500) {
      const codes: Record<number, string> = {
        400: 'bad_request',
        413: 'too_large',
        415: 'unsupported_media_type',
      };
      return reply.code(status).send({
        error: codes[status] ?? 'bad_request',
        message: error.message,
      });
    }
    app.log.error(
      { err: { message: error.message, stack: error.stack } },
      'request failed'
    );
    return reply
      .code(500)
      .send({ error: 'internal', message: 'Something went wrong' });
  });

  registerInstanceRoutes(app, ctx);
  registerEventRoutes(app, ctx);
  registerParticipantRoutes(app, ctx);
  registerLiveRoutes(app, ctx);
  await registerSite(app, ctx);

  app.decorate('hub', hub);
  app.decorate('sweep', () => {
    const ids = sweepExpired(db, todayUTC(new Date(clock.now())));
    for (const id of ids) hub.deleted(id);
    if (ids.length > 0) {
      if (!db.checkpoint()) app.log.warn('checkpoint after sweep incomplete');
      app.log.info({ deleted: ids.length }, 'expired events deleted');
    }
    return ids.length;
  });
  // Before the server stops, not after: it waits for every open connection to
  // finish, and a live stream never finishes by itself — on `onClose` a
  // single open browser tab held the shutdown until the hard timeout.
  app.addHook('preClose', async () => hub.close());

  return app;
}
