import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/passwords.js';
import { loadSecret } from '../src/auth/secret.js';
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
