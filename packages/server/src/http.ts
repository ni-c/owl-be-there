import { isIPv4, isIPv6 } from 'node:net';
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
 * be turned into a bucket of one's own.
 *
 * A /64 is what one household or one phone is handed, and every address inside
 * it is free for the taking — limiting the single address would limit nothing.
 * The key lives in memory only and is never written anywhere.
 */
export function clientKey(ip: string): string {
  const address = withoutPort(ip);
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return mapped[1]!;
  if (isIPv4(address)) return address;
  if (!isIPv6(address)) return 'unknown';
  return `${expandIPv6(address).slice(0, 4).join(':')}::/64`;
}

/**
 * A coarser key: an IPv4 address, or the /48 of an IPv6 address — what one
 * site or one rented server is commonly handed, and 65,536 of the /64s above.
 * It is what the limits use that someone with a whole prefix must not be able
 * to multiply: the route limits, the live streams, the password checks and the
 * new events.
 */
export function networkKey(ip: string): string {
  const key = clientKey(ip);
  if (!key.endsWith('::/64')) return key;
  return `${key.split(':').slice(0, 3).join(':')}::/48`;
}

/** The address of `203.0.113.7:51234` or `[2001:db8::1]:443`; others as given. */
function withoutPort(ip: string): string {
  if (isIPv4(ip) || isIPv6(ip)) return ip;
  const bracketed = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(ip);
  if (bracketed) return bracketed[1]!;
  const v4 = /^(\d+\.\d+\.\d+\.\d+):\d{1,5}$/.exec(ip);
  return v4 ? v4[1]! : ip;
}

/** The eight groups of an IPv6 address, zero-padded, with `::` expanded. */
export function expandIPv6(ip: string): string[] {
  const address = ip.split('%')[0]!.toLowerCase();
  const [head, tail] = address.includes('::')
    ? (address.split('::') as [string, string])
    : [address, null];
  const left = head === '' ? [] : head.split(':');
  const right = tail === null || tail === '' ? [] : tail.split(':');
  const missing = 8 - left.length - right.length;
  const groups =
    tail === null
      ? left
      : [...left, ...Array<string>(missing).fill('0'), ...right];
  return groups.map((group) => group.padStart(4, '0'));
}
