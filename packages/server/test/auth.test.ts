import { randomBytes, scryptSync } from 'node:crypto';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertPasswordCapacity,
  hashPassword,
  ScryptGate,
  verifyPassword,
} from '../src/auth/passwords.js';
import { loadSecret } from '../src/auth/secret.js';
import {
  DEFAULT_THROTTLE_LIMITS,
  PasswordThrottle,
} from '../src/auth/throttle.js';
import {
  hashAdminToken,
  newAdminToken,
  readParticipantToken,
  signParticipantToken,
  verifyAdminToken,
} from '../src/auth/tokens.js';

const secret = Buffer.alloc(32, 1);

describe('admin tokens', () => {
  it('verify against their hash and nothing else', () => {
    const token = newAdminToken();
    expect(token).toMatch(/^[\w-]{43}$/);
    const hash = hashAdminToken(token);
    expect(verifyAdminToken(token, hash)).toBe(true);
    expect(verifyAdminToken(newAdminToken(), hash)).toBe(false);
    expect(verifyAdminToken(undefined, hash)).toBe(false);
    expect(verifyAdminToken('', hash)).toBe(false);
    expect(verifyAdminToken('x'.repeat(129), hash)).toBe(false);
    expect(verifyAdminToken(token, 'not-hex')).toBe(false);
  });
});

describe('participant tokens', () => {
  const token = signParticipantToken(secret, 'event', 'person', 3);

  it('read back the participant and generation they were signed for', () => {
    expect(readParticipantToken(secret, 'event', token)).toEqual({
      participantId: 'person',
      generation: 3,
    });
  });

  it('are worthless for another event or under another secret', () => {
    expect(readParticipantToken(secret, 'other', token)).toBeNull();
    expect(
      readParticipantToken(Buffer.alloc(32, 2), 'event', token)
    ).toBeNull();
  });

  it('refuse any tampering', () => {
    const [id, , mac] = token.split('.');
    for (const bad of [
      `${id}.4.${mac}`,
      `someone.3.${mac}`,
      `${token}x`,
      'a.b',
      'a.b.c.d',
      `${id}.-1.${mac}`,
      `${id}.3.`,
      '',
      undefined,
      'x'.repeat(201),
    ]) {
      expect(readParticipantToken(secret, 'event', bad)).toBeNull();
    }
  });
});

describe('passwords', () => {
  it('verify the right password and refuse a wrong one', async () => {
    const stored = await hashPassword('correct horse');
    expect(stored).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('Correct horse', stored)).toBe(false);
  });

  describe('typed on another keyboard', () => {
    const composed = 'Gr\u00fc\u00dfe123';
    const decomposed = 'Gru\u0308\u00dfe123';

    // A hash as an earlier release made it: from the string as it came.
    const legacyHash = (password: string): string => {
      const salt = randomBytes(16);
      const derived = scryptSync(password, salt, 64, {
        N: 32_768,
        r: 8,
        p: 1,
        maxmem: 256 * 1024 * 1024,
      });
      return [
        'scrypt',
        32_768,
        8,
        1,
        salt.toString('base64'),
        derived.toString('base64'),
      ].join('$');
    };

    it('is one password, however the letters are put together', async () => {
      expect(composed).not.toBe(decomposed);
      for (const set of [composed, decomposed]) {
        const stored = await hashPassword(set);
        expect(await verifyPassword(composed, stored)).toBe(true);
        expect(await verifyPassword(decomposed, stored)).toBe(true);
        expect(await verifyPassword('Grusse123', stored)).toBe(false);
      }
    });

    it('still opens a hash made from either form before', async () => {
      for (const set of [composed, decomposed]) {
        const stored = legacyHash(set);
        expect(await verifyPassword(composed, stored)).toBe(set === composed);
        expect(await verifyPassword(decomposed, stored)).toBe(true);
        expect(await verifyPassword('wrong', stored)).toBe(false);
      }
    });

    it('leaves ASCII, the empty string and compatibility forms alone', async () => {
      const ascii = await hashPassword('correct horse');
      expect(await verifyPassword('correct horse', ascii)).toBe(true);
      expect(await verifyPassword('correct  horse', ascii)).toBe(false);
      const empty = await hashPassword('');
      expect(await verifyPassword('', empty)).toBe(true);
      expect(await verifyPassword(' ', empty)).toBe(false);
      // Full-width letters are other letters: NFC does not fold them.
      const wide = await hashPassword('\uff21bc');
      expect(await verifyPassword('Abc', wide)).toBe(false);
      expect(await verifyPassword('\uff21bc', wide)).toBe(true);
    });
  });

  it('salt every hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('never accept a malformed or shortened hash', async () => {
    const stored = await hashPassword('pw');
    const parts = stored.split('$');
    const truncated = [
      ...parts.slice(0, 5),
      Buffer.from(parts[5]!, 'base64').subarray(0, 1).toString('base64'),
    ].join('$');
    for (const bad of [
      '',
      'scrypt',
      'bcrypt$1$2$3$4$5',
      truncated,
      stored.replace('32768', 'x'),
    ]) {
      expect(await verifyPassword('pw', bad), bad).toBe(false);
    }
  });
});

describe('loadSecret', () => {
  it('creates a private key file once and reads it back after', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owl-secret-'));
    const first = loadSecret(dir, null);
    expect(first).toHaveLength(32);
    expect(statSync(join(dir, 'secret.key')).mode & 0o777).toBe(0o600);
    expect(loadSecret(dir, null).equals(first)).toBe(true);
    expect(readFileSync(join(dir, 'secret.key'), 'utf8')).toBe(
      first.toString('base64')
    );
  });

  it('prefers the override', () => {
    expect(loadSecret('/nonexistent', 'y'.repeat(40)).toString()).toBe(
      'y'.repeat(40)
    );
  });

  it('refuses a file that was cut short', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owl-secret-'));
    writeFileSync(join(dir, 'secret.key'), 'c2hvcnQ=');
    expect(() => loadSecret(dir, null)).toThrow(/shorter than 32 bytes/);
  });

  it('leaves nothing but the key in the directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owl-secret-'));
    loadSecret(dir, null);
    loadSecret(dir, null);
    expect(readdirSync(dir)).toEqual(['secret.key']);
  });

  it('keeps a key that is there, and refuses one of 31 bytes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owl-secret-'));
    const key = Buffer.alloc(32, 9);
    writeFileSync(join(dir, 'secret.key'), key.toString('base64'));
    expect(loadSecret(dir, null).equals(key)).toBe(true);
    expect(readdirSync(dir)).toEqual(['secret.key']);
    writeFileSync(
      join(dir, 'secret.key'),
      Buffer.alloc(31, 9).toString('base64')
    );
    expect(() => loadSecret(dir, null)).toThrow(/shorter than 32 bytes/);
  });

  it('says what is wrong with an empty file left by a crash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owl-secret-'));
    writeFileSync(join(dir, 'secret.key'), '');
    expect(() => loadSecret(dir, null)).toThrow(/delete it/);
    expect(readdirSync(dir)).toEqual(['secret.key']);
  });

  it('never writes a file with an override', () => {
    const dir = mkdtempSync(join(tmpdir(), 'owl-secret-'));
    loadSecret(dir, 'z'.repeat(32));
    expect(readdirSync(dir)).toEqual([]);
  });

  it('passes on errors other than an existing file', () => {
    expect(() => loadSecret('/nonexistent/dir', null)).toThrow(/ENOENT/);
  });
});

describe('PasswordThrottle', () => {
  const clock = {
    time: 0,
    now() {
      return this.time;
    },
  };
  const limits = { ...DEFAULT_THROTTLE_LIMITS, perNetwork: 3, capacity: 2 };

  it('lets a network ask only so often in a window, then again', () => {
    clock.time = 0;
    const throttle = new PasswordThrottle(clock, limits);
    expect(throttle.attempt('e', 'a', 'net')).toBe(0);
    expect(throttle.attempt('e', 'b', 'net')).toBe(0);
    expect(throttle.attempt('e', 'c', 'net')).toBe(0);
    expect(throttle.attempt('e', 'd', 'net')).toBe(limits.networkWindowMs);
    expect(throttle.attempt('e', 'd', 'other')).toBe(0);
    clock.time = limits.networkWindowMs;
    expect(throttle.attempt('e', 'd', 'net')).toBe(0);
  });

  it('caps the wait at its maximum', () => {
    clock.time = 0;
    const throttle = new PasswordThrottle(clock, limits);
    for (let miss = 0; miss < 40; miss += 1) throttle.failed('e', 'max');
    expect(throttle.attempt('e', 'max', 'net')).toBe(limits.maxDelayMs);
  });

  it('forgets misses long past', () => {
    clock.time = 0;
    const throttle = new PasswordThrottle(clock, limits);
    for (let miss = 0; miss < 4; miss += 1) throttle.failed('e', 'max');
    clock.time = 2 * limits.maxDelayMs + 1;
    // Counted afresh: one miss, no wait.
    throttle.failed('e', 'max');
    expect(throttle.attempt('e', 'max', 'net')).toBe(0);
  });

  it('remembers no more names and networks than its capacity', () => {
    clock.time = 0;
    const throttle = new PasswordThrottle(clock, limits);
    for (const name of ['a', 'b', 'c']) {
      throttle.failed('e', name);
      throttle.attempt('e', name, name);
    }
    expect(throttle.size).toEqual({ names: 2, networks: 2 });
  });
  it('keeps a name that still waits when others are forgotten', () => {
    clock.time = 0;
    const throttle = new PasswordThrottle(clock, limits);
    for (let miss = 0; miss < 5; miss += 1) throttle.failed('e', 'target');
    expect(throttle.attempt('e', 'target', 'net')).toBe(limits.baseDelayMs);
    for (const name of ['a', 'b', 'c', 'd', 'e', 'f'])
      throttle.failed('e', name);
    expect(throttle.size.names).toBe(limits.capacity);
    expect(throttle.attempt('e', 'target', 'net')).toBe(limits.baseDelayMs);
  });

  it('forgets a name whose wait is over, and one that never waited', () => {
    clock.time = 0;
    const throttle = new PasswordThrottle(clock, limits);
    for (let miss = 0; miss < 5; miss += 1) throttle.failed('e', 'target');
    throttle.failed('e', 'a');
    // Over capacity: `a` has no wait, `target` has; `a` is forgotten.
    throttle.failed('e', 'b');
    expect(throttle.attempt('e', 'target', 'net')).toBe(limits.baseDelayMs);
    // The boundary: a wait that ends now no longer protects the entry.
    clock.time = limits.baseDelayMs;
    throttle.failed('e', 'c');
    throttle.failed('e', 'd');
    expect(throttle.size.names).toBe(limits.capacity);
    // `target` was the oldest and its wait is over: it went first.
    for (let miss = 0; miss < 4; miss += 1) throttle.failed('e', 'target');
    expect(throttle.attempt('e', 'target', 'net')).toBe(0);
  });

  it('forgets the oldest waiting name when every name waits, and keeps the newest', () => {
    clock.time = 0;
    const throttle = new PasswordThrottle(clock, limits);
    for (const name of ['old', 'mid']) {
      for (let miss = 0; miss < 5; miss += 1) throttle.failed('e', name);
    }
    for (let miss = 0; miss < 5; miss += 1) throttle.failed('e', 'new');
    expect(throttle.size.names).toBe(limits.capacity);
    expect(throttle.attempt('e', 'old', 'net')).toBe(0);
    expect(throttle.attempt('e', 'mid', 'net')).toBe(limits.baseDelayMs);
    expect(throttle.attempt('e', 'new', 'net')).toBe(limits.baseDelayMs);
  });

  it('keeps a name just stored even when it is the only one that can go', () => {
    clock.time = 0;
    const throttle = new PasswordThrottle(clock, { ...limits, capacity: 1 });
    throttle.failed('e', 'a');
    throttle.failed('e', 'a');
    expect(throttle.size.names).toBe(1);
    for (let miss = 0; miss < 3; miss += 1) throttle.failed('e', 'a');
    expect(throttle.attempt('e', 'a', 'net')).toBe(limits.baseDelayMs);
  });

  it('counts the passwords a network has hashed apart from its checks', () => {
    clock.time = 0;
    const throttle = new PasswordThrottle(clock, {
      ...limits,
      capacity: 100,
    });
    expect(throttle.chargeHash('net')).toBe(0);
    expect(throttle.chargeHash('net')).toBe(0);
    expect(throttle.chargeHash('net')).toBe(0);
    expect(throttle.chargeHash('net')).toBe(limits.networkWindowMs);
    // Another network, and the checks of this one, are not affected.
    expect(throttle.chargeHash('other')).toBe(0);
    expect(throttle.attempt('e', 'a', 'net')).toBe(0);
    clock.time = limits.networkWindowMs - 1;
    expect(throttle.chargeHash('net')).toBe(1);
    clock.time = limits.networkWindowMs;
    expect(throttle.chargeHash('net')).toBe(0);
  });

  it('lets a right password clear the miss counted before the check', () => {
    clock.time = 0;
    const throttle = new PasswordThrottle(clock, limits);
    for (let miss = 0; miss < 4; miss += 1) throttle.failed('e', 'max');
    // The miss for a check that is still running makes five ...
    throttle.failed('e', 'max');
    expect(throttle.attempt('e', 'max', 'net')).toBe(limits.baseDelayMs);
    // ... and the right password wipes the slate.
    throttle.succeeded('e', 'max');
    expect(throttle.attempt('e', 'max', 'net')).toBe(0);
    expect(throttle.size.names).toBe(0);
  });
});

describe('PasswordThrottle, when the clock steps back', () => {
  const HOUR = 60 * 60_000;
  const clock = {
    time: 0,
    now() {
      return this.time;
    },
  };
  const limits = { ...DEFAULT_THROTTLE_LIMITS, perNetwork: 3 };
  const block = (throttle: PasswordThrottle, name: string): void => {
    for (let miss = 0; miss < limits.freeFailures; miss += 1) {
      throttle.failed('e', name);
    }
  };

  it('keeps a name waiting for its own wait, not for the step as well', () => {
    clock.time = 2 * HOUR;
    const throttle = new PasswordThrottle(clock, limits);
    block(throttle, 'max');
    expect(throttle.attempt('e', 'max', 'net')).toBe(limits.baseDelayMs);
    clock.time -= HOUR;
    expect(throttle.attempt('e', 'max', 'net')).toBe(limits.baseDelayMs);
    // The wait runs out as it would have.
    clock.time += limits.baseDelayMs - 1;
    expect(throttle.attempt('e', 'max', 'net')).toBe(1);
    clock.time += 1;
    expect(throttle.attempt('e', 'max', 'net')).toBe(0);
  });

  it('never makes a name wait longer than the maximum', () => {
    clock.time = 10 * HOUR;
    const throttle = new PasswordThrottle(clock, limits);
    for (let miss = 0; miss < 40; miss += 1) throttle.failed('e', 'max');
    clock.time -= 9 * HOUR;
    expect(throttle.attempt('e', 'max', 'net')).toBe(limits.maxDelayMs);
  });

  it('counts a miss after a step back as the first, not as the next', () => {
    clock.time = 2 * HOUR;
    const throttle = new PasswordThrottle(clock, limits);
    block(throttle, 'max');
    clock.time -= HOUR;
    throttle.failed('e', 'max');
    expect(throttle.attempt('e', 'max', 'net')).toBe(0);
  });

  it('lets a small step back stretch the wait by no more than the wait', () => {
    clock.time = 0;
    const throttle = new PasswordThrottle(clock, limits);
    block(throttle, 'max');
    clock.time = 20_000;
    clock.time -= 10_000;
    expect(throttle.attempt('e', 'max', 'net')).toBeLessThanOrEqual(
      limits.baseDelayMs
    );
  });

  it('ends a network window that lies in the future', () => {
    clock.time = 2 * HOUR;
    const throttle = new PasswordThrottle(clock, limits);
    for (let i = 0; i < limits.perNetwork; i += 1) {
      expect(throttle.attempt('e', 'a', 'net')).toBe(0);
    }
    expect(throttle.attempt('e', 'a', 'net')).toBe(limits.networkWindowMs);
    clock.time -= HOUR;
    expect(throttle.attempt('e', 'a', 'net')).toBe(0);
    expect(throttle.chargeHash('net')).toBe(0);
  });

  it('treats a step forward as the time that has passed', () => {
    clock.time = 0;
    const throttle = new PasswordThrottle(clock, limits);
    block(throttle, 'max');
    for (let i = 0; i < limits.perNetwork; i += 1) {
      throttle.attempt('e', 'other', 'net');
    }
    clock.time += HOUR;
    expect(throttle.attempt('e', 'max', 'net')).toBe(0);
    expect(throttle.attempt('e', 'other', 'net')).toBe(0);
  });

  it('keeps the window and the wait to the millisecond', () => {
    clock.time = 5;
    const throttle = new PasswordThrottle(clock, limits);
    block(throttle, 'max');
    clock.time = 5 + limits.baseDelayMs - 1;
    expect(throttle.attempt('e', 'max', 'net')).toBe(1);
    clock.time = 5 + limits.baseDelayMs;
    expect(throttle.attempt('e', 'max', 'net')).toBe(0);
  });
});

describe('ScryptGate', () => {
  const gated = () => {
    let release!: (value: number) => void;
    const done = new Promise<number>((resolve) => (release = resolve));
    return { job: () => done, release };
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('runs jobs up to its limit, queues a few and turns the rest away', async () => {
    const gate = new ScryptGate(1, 1);
    const first = gated();
    const second = gated();
    const running = gate.run(first.job);
    const waiting = gate.run(second.job);
    expect(gate.hasRoom).toBe(false);
    await expect(gate.run(async () => 0)).rejects.toMatchObject({
      statusCode: 503,
      code: 'busy',
    });
    first.release(1);
    expect(await running).toBe(1);
    // The queued job took the freed slot; the queue has room again.
    expect(gate.hasRoom).toBe(true);
    second.release(2);
    expect(await waiting).toBe(2);
    await tick();
    expect(gate.hasRoom).toBe(true);
  });

  it('starts queued jobs in order and never above its concurrency', async () => {
    const gate = new ScryptGate(2, 3);
    let active = 0;
    let peak = 0;
    const started: number[] = [];
    const jobs = [0, 1, 2, 3, 4].map((n) =>
      gate.run(async () => {
        started.push(n);
        active += 1;
        peak = Math.max(peak, active);
        await tick();
        active -= 1;
        return n;
      })
    );
    expect(await Promise.all(jobs)).toEqual([0, 1, 2, 3, 4]);
    expect(started).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  it('frees the slot of a job that fails', async () => {
    const gate = new ScryptGate(1, 0);
    await expect(
      gate.run(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(gate.hasRoom).toBe(true);
    expect(await gate.run(async () => 7)).toBe(7);
  });

  it('with no queue turns away a job as soon as the slots are taken', async () => {
    const gate = new ScryptGate(1, 0);
    const first = gated();
    const running = gate.run(first.job);
    expect(gate.hasRoom).toBe(false);
    await expect(gate.run(async () => 0)).rejects.toMatchObject({
      statusCode: 503,
    });
    first.release(1);
    await running;
  });

  it('hashes and checks passwords within the shared gate', async () => {
    expect(() => assertPasswordCapacity()).not.toThrow();
    const hash = await hashPassword('secret-1');
    expect(await verifyPassword('secret-1', hash)).toBe(true);
    expect(await verifyPassword('secret-2', hash)).toBe(false);
  });
});
