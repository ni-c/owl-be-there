import { fileURLToPath } from 'node:url';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import type { Clock } from '../src/context.js';
import { migrate } from '../src/db/migrations.js';
import { Db } from '../src/db/sqlite.js';
import type { ThrottleLimits } from '../src/auth/throttle.js';
import type { StreamLimits } from '../src/sse.js';

export const CLIENT_DIR = fileURLToPath(
  new URL('./fixtures/client', import.meta.url)
);

/** A clock that stands still until a test moves it. Starts on 2027-03-01, noon UTC. */
export class FakeClock implements Clock {
  time = Date.UTC(2027, 2, 1, 12);
  now(): number {
    return this.time;
  }
  advanceDays(days: number): void {
    this.time += days * 86_400_000;
  }
}

export interface TestApp {
  app: FastifyInstance;
  db: Db;
  clock: FakeClock;
  config: Config;
  logs: string[];
}

export interface TestAppOptions {
  env?: Record<string, string>;
  site?: boolean;
  streamLimits?: StreamLimits;
  throttleLimits?: Partial<ThrottleLimits>;
}

export async function testApp(options: TestAppOptions = {}): Promise<TestApp> {
  const config = loadConfig({
    PUBLIC_URL: 'https://owl.example.org',
    LOG_LEVEL: 'info',
    RATE_LIMIT_MULTIPLIER: '1000',
    ...(options.site !== false && { CLIENT_DIR }),
    ...options.env,
  });
  const db = new Db(':memory:');
  migrate(db);
  const clock = new FakeClock();
  const logs: string[] = [];
  const app = await buildApp({
    config,
    db,
    secret: Buffer.alloc(32, 7),
    clock,
    logStream: { write: (line: string) => void logs.push(line) },
    ...(options.streamLimits && { streamLimits: options.streamLimits }),
    ...(options.throttleLimits && { throttleLimits: options.throttleLimits }),
    heartbeatMs: 60_000,
  });
  return { app, db, clock, config, logs };
}

export const WEEKEND = ['2027-03-06', '2027-03-07'];

export function eventBody(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    title: 'Summer tournament',
    emoji: 'soccer',
    language: 'en',
    durationDays: 1,
    days: ['2027-03-05', ...WEEKEND],
    ...overrides,
  };
}

export async function createEvent(
  app: FastifyInstance,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; adminToken: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/events',
    payload: eventBody(overrides),
  });
  if (response.statusCode !== 201)
    throw new Error(`create failed: ${response.body}`);
  return response.json();
}

export async function join(
  app: FastifyInstance,
  id: string,
  name: string,
  password?: string
): Promise<{ participantId: string; token: string; created: boolean }> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/events/${id}/session`,
    payload: { name, ...(password !== undefined && { password }) },
  });
  if (response.statusCode !== 200)
    throw new Error(`join failed: ${response.body}`);
  return response.json();
}

export async function mark(
  app: FastifyInstance,
  id: string,
  who: { participantId: string; token: string },
  yes: string[],
  maybe: string[] = [],
  baseRev = 0
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'PUT',
    url: `/api/events/${id}/participants/${who.participantId}/marks`,
    headers: { 'x-participant-token': who.token },
    payload: { baseRev, yes, maybe },
  });
}

export async function getSnapshot(app: FastifyInstance, id: string) {
  const response = await app.inject({
    method: 'GET',
    url: `/api/events/${id}`,
  });
  if (response.statusCode !== 200)
    throw new Error(`get failed: ${response.statusCode}`);
  return response.json();
}
