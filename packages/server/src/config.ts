import { isIP } from 'node:net';
import { isAbsolute, resolve } from 'node:path';

/**
 * Everything the process reads from its environment, parsed once at start-up.
 *
 * A bad value stops the process with every problem listed at once, rather than
 * the first one and then the next on the following attempt.
 */
export interface Config {
  host: string;
  port: number;
  /** Where the SQLite database and the server secret live. */
  dataDir: string;
  /**
   * The public origin, without a trailing slash. It is the only source of
   * absolute URLs — link previews, calendar files — so a change of domain is a
   * change of this one value.
   */
  publicUrl: string;
  /** The built client, or null to run the API alone. */
  clientDir: string | null;
  /** Proxies whose `X-Forwarded-For` is believed, or false for none. */
  trustProxy: string[] | false;
  /** Off is the emergency switch: existing events keep working. */
  creationEnabled: boolean;
  /** A ceiling on the number of stored events. */
  maxEvents: number;
  /**
   * A ceiling on the size of the database, so a flood of full events cannot
   * fill the disk: past it no new event is taken. Null for none. Events are
   * not equal — a full one (150 people on 186 days) takes about 2.8 MB — so
   * the number of events alone does not bound the size.
   */
  maxDbBytes: number | null;
  /** Scales every rate limit; the end-to-end suite raises it, nothing else should. */
  rateLimitMultiplier: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  /** Overrides the secret in the data directory, for instances without a disk. */
  secret: string | null;
  /** Shown on the privacy page, so a reader knows who runs this instance. */
  operatorName: string | null;
  operatorContact: string | null;
  imprintUrl: string | null;
  /** What the operator's reverse proxy and backups keep; null when not stated. */
  logRetentionDays: number | null;
  backupRetentionDays: number | null;
}

export class ConfigError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;

type Env = Record<string, string | undefined>;

/** An unset or blank variable is the same thing: not configured. */
function read(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

export function loadConfig(env: Env = process.env): Config {
  const problems: string[] = [];

  const integer = (
    name: string,
    fallback: number,
    min: number,
    max: number
  ): number => {
    const raw = read(env, name);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      problems.push(`${name} must be a whole number from ${min} to ${max}`);
      return fallback;
    }
    return value;
  };

  const optionalInteger = (
    name: string,
    min: number,
    max: number
  ): number | null => {
    if (read(env, name) === null) return null;
    return integer(name, min, min, max);
  };

  const boolean = (name: string, fallback: boolean): boolean => {
    const raw = read(env, name)?.toLowerCase();
    if (raw === undefined) return fallback;
    if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
    if (['0', 'false', 'no', 'off'].includes(raw)) return false;
    problems.push(`${name} must be true or false`);
    return fallback;
  };

  const port = integer('PORT', 8080, 1, 65_535);
  const host = read(env, 'HOST') ?? '127.0.0.1';

  const publicUrl = parsePublicUrl(
    read(env, 'PUBLIC_URL') ?? `http://localhost:${port}`,
    problems
  );

  const dataDir = resolve(read(env, 'DATA_DIR') ?? 'data');
  const clientDirRaw = read(env, 'CLIENT_DIR');
  const clientDir =
    clientDirRaw === null
      ? null
      : isAbsolute(clientDirRaw)
        ? clientDirRaw
        : resolve(clientDirRaw);

  const logLevelRaw = read(env, 'LOG_LEVEL') ?? 'info';
  const logLevel = (LOG_LEVELS as readonly string[]).includes(logLevelRaw)
    ? (logLevelRaw as Config['logLevel'])
    : (problems.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}`),
      'info' as const);

  const secret = read(env, 'OWL_SECRET');
  if (secret !== null && secret.length < 32) {
    problems.push('OWL_SECRET must be at least 32 characters long');
  }

  const imprintUrl = read(env, 'IMPRINT_URL');
  if (imprintUrl !== null && !/^https?:\/\/\S+$/i.test(imprintUrl)) {
    problems.push('IMPRINT_URL must be an http(s) URL');
  }

  const trustProxy = parseTrustProxy(read(env, 'TRUST_PROXY'), problems);

  const config: Config = {
    host,
    port,
    dataDir,
    publicUrl,
    clientDir,
    trustProxy,
    creationEnabled: boolean('CREATION_ENABLED', true),
    maxEvents: integer('MAX_EVENTS', 10_000, 1, 10_000_000),
    maxDbBytes: optionalInteger('MAX_DB_BYTES', 1, 2 ** 50),
    rateLimitMultiplier: integer('RATE_LIMIT_MULTIPLIER', 1, 1, 100_000),
    logLevel,
    secret,
    operatorName: read(env, 'OPERATOR_NAME'),
    operatorContact: read(env, 'OPERATOR_CONTACT'),
    imprintUrl,
    logRetentionDays: optionalInteger('LOG_RETENTION_DAYS', 0, 3650),
    backupRetentionDays: optionalInteger('BACKUP_RETENTION_DAYS', 0, 3650),
  };

  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}

/**
 * The origin and nothing else. A path would be appended to by every absolute
 * URL the server builds, and a trailing slash would double the one they start
 * with.
 */
function parsePublicUrl(raw: string, problems: string[]): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    problems.push(
      'PUBLIC_URL must be an absolute URL such as https://example.org'
    );
    return raw;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    problems.push('PUBLIC_URL must use http or https');
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    problems.push(
      'PUBLIC_URL must be an origin without a path, query or fragment'
    );
  }
  return url.origin;
}

/**
 * Loopback by default: the documented deployment puts a reverse proxy on the
 * same machine. `false` (or `none`) trusts nobody, which is right when the
 * server faces the internet itself.
 */
function parseTrustProxy(
  raw: string | null,
  problems: string[]
): string[] | false {
  if (raw === null) return ['127.0.0.1', '::1'];
  if (['false', 'none', 'off', '0'].includes(raw.toLowerCase())) return false;
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  const invalid = entries.filter((entry) => !isProxyEntry(entry));
  if (invalid.length > 0) {
    problems.push(
      `TRUST_PROXY must list addresses, subnets or loopback, linklocal, uniquelocal — not ${invalid.join(', ')}`
    );
  }
  return entries.length > 0 ? entries : false;
}

/** An address, a subnet in CIDR notation, or one of proxy-addr's names. */
function isProxyEntry(entry: string): boolean {
  if (['loopback', 'linklocal', 'uniquelocal'].includes(entry)) return true;
  const [address, bits, ...rest] = entry.split('/');
  if (rest.length > 0 || address === undefined) return false;
  const version = isIP(address);
  if (version === 0) return false;
  if (bits === undefined) return true;
  if (!/^\d{1,3}$/.test(bits)) return false;
  // A /0 is refused by proxy-addr, and would trust every address anyway.
  const length = Number(bits);
  return length >= 1 && length <= (version === 4 ? 32 : 128);
}
