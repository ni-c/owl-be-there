import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
