import type { Clock } from '../context.js';

export interface ThrottleLimits {
  /** Wrong passwords for one name before it has to wait. */
  freeFailures: number;
  /** The first wait; each further wrong password doubles it. */
  baseDelayMs: number;
  maxDelayMs: number;
  /** Password checks one network may ask for in a window, across all names. */
  perNetwork: number;
  networkWindowMs: number;
  /** Names and networks remembered at most; the oldest are forgotten first. */
  capacity: number;
}

export const DEFAULT_THROTTLE_LIMITS: ThrottleLimits = {
  freeFailures: 5,
  baseDelayMs: 30_000,
  maxDelayMs: 15 * 60_000,
  perNetwork: 60,
  networkWindowMs: 5 * 60_000,
  capacity: 10_000,
};

interface NameEntry {
  failures: number;
  blockedUntil: number;
  lastFailure: number;
}

interface NetworkEntry {
  windowStart: number;
  count: number;
}

/** A Map that forgets its least recently used entries beyond `capacity`. */
class Lru<V> {
  private readonly map = new Map<string, V>();
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get(key: string): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.capacity) {
      this.map.delete(this.map.keys().next().value!);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }
}

/**
 * The brake on guessing passwords.
 *
 * The rate limit per address does not stop someone with many addresses — an
 * IPv6 /48 holds 65,536 of the /64s the limiter counts. So wrong passwords are
 * also counted per name: after a few, that name answers only after a wait,
 * which doubles with every further miss and ends with a right password. It is
 * a wait, not a lock: whoever owns the name gets in once it has passed. On top
 * of that, a whole network may only ask for so many password checks, which
 * also keeps scrypt from being used to tie up the server.
 *
 * Everything lives in memory and is keyed by event and name, or by network
 * prefix; nothing is written anywhere.
 */
export class PasswordThrottle {
  private readonly names: Lru<NameEntry>;
  private readonly networks: Lru<NetworkEntry>;
  private readonly clock: Clock;
  private readonly limits: ThrottleLimits;

  constructor(clock: Clock, limits: ThrottleLimits = DEFAULT_THROTTLE_LIMITS) {
    this.clock = clock;
    this.limits = limits;
    this.names = new Lru(limits.capacity);
    this.networks = new Lru(limits.capacity);
  }

  /**
   * Milliseconds until a password for this name may be checked from this
   * network, or 0 if it may now. Counts the attempt against the network.
   */
  attempt(eventId: string, nameKey: string, network: string): number {
    const now = this.clock.now();
    const name = this.names.get(nameId(eventId, nameKey));
    if (name && name.blockedUntil > now) return name.blockedUntil - now;

    const entry = this.networks.get(network);
    if (!entry || now - entry.windowStart >= this.limits.networkWindowMs) {
      this.networks.set(network, { windowStart: now, count: 1 });
      return 0;
    }
    if (entry.count >= this.limits.perNetwork) {
      return entry.windowStart + this.limits.networkWindowMs - now;
    }
    entry.count += 1;
    return 0;
  }

  failed(eventId: string, nameKey: string): void {
    const now = this.clock.now();
    const id = nameId(eventId, nameKey);
    const previous = this.names.get(id);
    // A name nobody has guessed at for a long while starts afresh.
    const stale =
      previous !== undefined &&
      now - previous.lastFailure > 2 * this.limits.maxDelayMs;
    const failures = (previous && !stale ? previous.failures : 0) + 1;
    const over = failures - this.limits.freeFailures;
    const delay =
      over < 0
        ? 0
        : Math.min(
            this.limits.baseDelayMs * 2 ** Math.min(over, 30),
            this.limits.maxDelayMs
          );
    this.names.set(id, {
      failures,
      blockedUntil: now + delay,
      lastFailure: now,
    });
  }

  succeeded(eventId: string, nameKey: string): void {
    this.names.delete(nameId(eventId, nameKey));
  }

  /** Entries remembered, for tests. */
  get size(): { names: number; networks: number } {
    return { names: this.names.size, networks: this.networks.size };
  }
}

const nameId = (eventId: string, nameKey: string): string =>
  `${eventId}\u0000${nameKey}`;
