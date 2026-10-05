import { isIPv4, isIPv6 } from 'node:net';
import { normalizeIP } from '@fastify/rate-limit';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';

/** An error the API answers with on purpose, as `{ error, message }`. */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const notFound = (): ApiError =>
  new ApiError(404, 'not_found', 'No such event');

export const closed = (): ApiError =>
  new ApiError(409, 'closed', 'The poll is closed');

export const nameTaken = (): ApiError =>
  new ApiError(409, 'name_taken', 'Someone already has that name');

export class ValidationError extends ApiError {
  readonly issues: { path: string; message: string }[];

  constructor(issues: { path: string; message: string }[]) {
    super(400, 'validation_failed', 'The request is not valid');
    this.issues = issues;
  }
}

/** Parse a request body with a schema, or answer 400 naming each problem. */
export function parseBody<S extends z.ZodType>(
  schema: S,
  body: unknown
): z.output<S> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  throw new ValidationError(
    result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))
  );
}

/** A header's value, or undefined — never an array. */
export function header(
  request: FastifyRequest,
  name: string
): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The key one client is known by: its IPv4 address, or the /64 of its IPv6
 * address. An address with a port — `203.0.113.7:51234`, `[2001:db8::1]:443`,
 * as some proxies write it — is the address alone, and anything that is no
 * address at all is one shared `unknown`, so a port or a made-up string cannot
 * be turned into a bucket of one's own. An IPv4-mapped IPv6 address is the
 * IPv4 address.
 *
 * A /64 is what one household or one phone is handed, and every address inside
 * it is free for the taking — limiting the single address would limit nothing.
 * The key lives in memory only and is never written anywhere.
 */
export function clientKey(ip: string): string {
  return addressKey(ip, 64);
}

/**
 * A coarser key: an IPv4 address, or the /48 of an IPv6 address — what one
 * site or one rented server is commonly handed, and 65,536 of the /64s above.
 * It is what the limits use that someone with a whole prefix must not be able
 * to multiply: the route limits, the live streams, the password checks and the
 * new events.
 */
export function networkKey(ip: string): string {
  return addressKey(ip, 48);
}

function addressKey(ip: string, ipv6Subnet: number): string {
  const address = withoutPort(ip);
  return isIPv4(address) || isIPv6(address)
    ? normalizeIP(address, ipv6Subnet)
    : 'unknown';
}

/** The address of `203.0.113.7:51234` or `[2001:db8::1]:443`; others as given. */
function withoutPort(ip: string): string {
  if (isIPv4(ip) || isIPv6(ip)) return ip;
  const bracketed = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(ip);
  if (bracketed) return bracketed[1]!;
  const v4 = /^(\d+\.\d+\.\d+\.\d+):\d{1,5}$/.exec(ip);
  return v4 ? v4[1]! : ip;
}
