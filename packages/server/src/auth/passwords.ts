import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

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
 * for the person typing their password. The session route is rate limited, so
 * a small server never has more than a handful of these in flight.
 */
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELISATION = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 256 * 1024 * 1024;

/**
 * Node's own scrypt rather than argon2: no native module to build, no extra
 * dependency to keep patched, and it is a perfectly respectable KDF.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISATION,
    maxmem: MAX_MEMORY,
  });
  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELISATION,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/** Constant-time check that never throws, whatever is in the database. */
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

  try {
    const derived = await scryptAsync(
      password,
      Buffer.from(salt, 'base64'),
      KEY_LENGTH,
      {
        N: Number(cost),
        r: Number(blockSize),
        p: Number(parallelisation),
        maxmem: MAX_MEMORY,
      }
    );
    return timingSafeEqual(derived, expectedBuffer);
  } catch {
    return false;
  }
}
