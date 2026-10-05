import type { Clock } from '../context.js';

export interface ThrottleLimits {
  /** Wrong passwords for one name before it has to wait. */
  freeFailures: number;
  /** The first wait; each further wrong password doubles it. */
  baseDelayMs: number;
  maxDelayMs: number;
  /**
   * Password checks one network may ask for in a window, across all names; the
   * same number of passwords it may have hashed, counted apart.
   */
  perNetwork: number;
  networkWindowMs: number;
  /**
   * Names and networks remembered at most; the oldest are forgotten first, but
   * a name that is still waiting only when nothing else is left to forget.
   */
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

/**
 * A Map that forgets entries beyond `capacity`: the least recently used one
 * that `expendable` allows, or the least recently used of all when it allows
 * none. The entry just stored is never the one forgotten.
 */
class Lru<V> {
  private readonly map = new Map<string, V>();
  private readonly capacity: number;
  private readonly expendable: (value: V) => boolean;

  constructor(
    capacity: number,
    expendable: (value: V) => boolean = () => true
  ) {
    this.capacity = capacity;
    this.expendable = expendable;
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
      let victim: string | undefined;
      for (const [other, entry] of this.map) {
        if (other === key) continue;
        victim ??= other;
        if (this.expendable(entry)) {
          victim = other;
          break;
        }
      }
      // Nothing else to forget: only with a capacity of zero.
      this.map.delete(victim ?? key);
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
 * of that, a whole network may only ask for so many password checks, and have
 * so many new passwords hashed, which keeps scrypt from being used to tie up
 * the server.
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
    // A name that still has to wait is the last thing to forget: flushing it
    // would hand the guesser a fresh set of free tries.
    this.names = new Lru(
      limits.capacity,
      (name) => name.blockedUntil <= this.clock.now()
    );
    this.networks = new Lru(limits.capacity);
  }

  /**
   * Milliseconds until a password for this name may be checked from this
   * network, or 0 if it may now. Counts the attempt against the network.
   *
   * A name that is waiting makes every network wait, the owner's included:
   * someone who keeps guessing keeps the owner out of new devices for as long
   * as they keep going. That is deliberate — the wait is what makes guessing
   * pointless — and sessions that already exist keep working.
   */
  attempt(eventId: string, nameKey: string, network: string): number {
    const now = this.clock.now();
    const name = this.names.get(nameId(eventId, nameKey));
    if (name && name.blockedUntil > now) return name.blockedUntil - now;
    return this.charge(`check\u0000${network}`, now);
  }

  /**
   * Milliseconds until this network may have another new password hashed, or 0
   * if it may now. Counts the hash against the network's budget for hashing.
   */
  chargeHash(network: string): number {
    return this.charge(`hash\u0000${network}`, this.clock.now());
  }

  private charge(key: string, now: number): number {
    const entry = this.networks.get(key);
    if (!entry || now - entry.windowStart >= this.limits.networkWindowMs) {
      this.networks.set(key, { windowStart: now, count: 1 });
      return 0;
    }
    if (entry.count >= this.limits.perNetwork) {
      return entry.windowStart + this.limits.networkWindowMs - now;
    }
    entry.count += 1;
    return 0;
  }

  /**
   * Count a wrong password. A route calls this before it starts checking and
   * `succeeded` when the password was right: the miss has to be on the books
   * while scrypt runs, or every guess in flight passes the wait unseen.
   */
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
