import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { ApiError } from '../http.js';

// `promisify(scrypt)` drops the overload that takes options, so wrap it by hand.
function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/**
 * scrypt parameters. N=2^15 with r=8 needs ~32 MB per hash, which is a sane
 * cost for a self-hosted app: comfortably slow for an attacker, unnoticeable
 * for the person typing their password. `ScryptGate` keeps a handful of these
 * in flight, however many networks ask at once.
 */
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELISATION = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 256 * 1024 * 1024;

/**
 * Lets a few scrypt jobs run at once and a few more wait; any further job is
 * turned away at once. scrypt runs on libuv's thread pool, which also reads the
 * static files, so a flood of hashes from many networks would stall the whole
 * page. Keeping half the pool free is what keeps the site loading.
 */
export class ScryptGate {
  private running = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly concurrency: number;
  private readonly queue: number;

  constructor(concurrency: number, queue: number) {
    this.concurrency = concurrency;
    this.queue = queue;
  }

  /** Whether a job started now would run or wait, rather than be turned away. */
  get hasRoom(): boolean {
    return this.running < this.concurrency || this.waiting.length < this.queue;
  }

  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.running < this.concurrency) {
      this.running += 1;
    } else if (this.waiting.length < this.queue) {
      // The job that finishes hands its slot over, leaving `running` as it is.
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      throw busy();
    }
    try {
      return await job();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running -= 1;
    }
  }
}

const busy = (): ApiError =>
  new ApiError(503, 'busy', 'The server is busy; try again in a moment');

const gate = new ScryptGate(2, 8);

/**
 * Answer 503 now if no password could be hashed or checked at the moment.
 * Routes call it before they charge anything to a name or a network, so a
 * request turned away costs nobody a try.
 */
export function assertPasswordCapacity(): void {
  if (!gate.hasRoom) throw busy();
}

/**
 * Node's own scrypt rather than argon2: no native module to build, no extra
 * dependency to keep patched, and it is a perfectly respectable KDF.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await gate.run(() =>
    scryptAsync(password.normalize('NFC'), salt, KEY_LENGTH, {
      N: COST,
      r: BLOCK_SIZE,
      p: PARALLELISATION,
      maxmem: MAX_MEMORY,
    })
  );
  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELISATION,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Constant-time check that never throws, whatever is in the database — except
 * the 503 for a server with no room to check it.
 */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, cost, blockSize, parallelisation, salt, expected] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  /**
   * The digest has to be the full length, not merely non-empty.
   *
   * scrypt finishes with a single PBKDF2 pass, which makes its output
   * prefix-stable: asking for 15 bytes returns the first 15 bytes of the 64.
   * Deriving `expectedBuffer.length` bytes therefore compared a stored hash
   * against itself however short it had been cut — a digest trimmed to one
   * byte would have admitted one password in 256. Nothing in the application
   * writes such a row, but the check belongs on the reading side, where a hash
   * that arrived by some other route is the whole point.
   */
  const expectedBuffer = Buffer.from(expected, 'base64');
  if (expectedBuffer.length !== KEY_LENGTH) return false;

  // The same visible password is one string on one keyboard and another on
  // the next ("ü" precomposed or "u" and a combining diaeresis), so it is
  // composed before it is hashed. A hash made before that, from whatever
  // was typed, is still met by trying the string as it came.
  const typed =
    password.normalize('NFC') === password
      ? [password]
      : [password.normalize('NFC'), password];
  for (const candidate of typed) {
    let derived: Buffer;
    try {
      derived = await gate.run(() =>
        scryptAsync(candidate, Buffer.from(salt, 'base64'), KEY_LENGTH, {
          N: Number(cost),
          r: Number(blockSize),
          p: Number(parallelisation),
          maxmem: MAX_MEMORY,
        })
      );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      return false;
    }
    if (timingSafeEqual(derived, expectedBuffer)) return true;
  }
  return false;
}
