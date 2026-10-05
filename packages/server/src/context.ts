import type { PasswordThrottle } from './auth/throttle.js';
import type { Config } from './config.js';
import type { Db } from './db/sqlite.js';
import type { PageTemplate } from './pages.js';
import type { PreviewRenderer } from './preview.js';
import type { SseHub } from './sse.js';

/** Where the time comes from — a test can stop it or move it. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** What every route needs. */
export interface AppContext {
  config: Config;
  db: Db;
  secret: Buffer;
  clock: Clock;
  hub: SseHub;
  template: PageTemplate | null;
  /** Link-preview pictures of events; null without a client to serve. */
  preview: PreviewRenderer | null;
  version: string;
  /** The security headers every response carries. */
  headers: Record<string, string>;
  throttle: PasswordThrottle;
}

/**
 * A rate limit scaled by `RATE_LIMIT_MULTIPLIER`, as `@fastify/rate-limit`
 * route config. The end-to-end suite runs hundreds of requests from one
 * address and raises the multiplier; nothing else should.
 */
export function limit(
  config: Config,
  max: number,
  timeWindow: string
): { rateLimit: { max: number; timeWindow: string } } {
  return { rateLimit: { max: max * config.rateLimitMultiplier, timeWindow } };
}
