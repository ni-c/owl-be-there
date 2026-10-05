import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import rateLimit from '@fastify/rate-limit';
import { todayUTC } from '@owl/shared';
import Fastify, {
  LogController,
  type FastifyError,
  type FastifyInstance,
} from 'fastify';
import {
  DEFAULT_THROTTLE_LIMITS,
  PasswordThrottle,
  type ThrottleLimits,
} from './auth/throttle.js';
import type { Config } from './config.js';
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

/** The server's own version, from its manifest. */
export function readVersion(): string {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  ) as { version: string };
  return manifest.version;
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
 * The headers every response carries. The live stream takes over its response
 * and skips the `onSend` hook, so it sets these itself from `ctx.headers`.
 */
export function securityHeaders(
  csp: string,
  https: boolean
): Record<string, string> {
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

export async function buildApp(
  options: BuildAppOptions
): Promise<FastifyInstance> {
  const { config, db, secret } = options;
  const clock = options.clock ?? systemClock;
  const requestTimeout = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;

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
    trustProxy: config.trustProxy === false ? false : config.trustProxy,
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

  const template = hasClient(config.clientDir)
    ? new PageTemplate(
        readFileSync(join(config.clientDir!, 'index.html'), 'utf8')
      )
    : null;
  const hub = new SseHub(options.streamLimits, options.heartbeatMs);
  const csp = contentSecurityPolicy(template?.scriptHashes ?? []);
  const https = config.publicUrl.startsWith('https:');
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
    headers: securityHeaders(csp, https),
    throttle: new PasswordThrottle(clock, {
      ...DEFAULT_THROTTLE_LIMITS,
      ...options.throttleLimits,
      perNetwork:
        (options.throttleLimits?.perNetwork ??
          DEFAULT_THROTTLE_LIMITS.perNetwork) * config.rateLimitMultiplier,
    }),
  };

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.headers(ctx.headers);
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
