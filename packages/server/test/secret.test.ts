import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { constants, tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSystemErrorName } from 'node:util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const links = vi.hoisted(() => ({
  error: null as string | null,
  // Written just before the link fails: another process won the race.
  winner: null as { path: string; key: string } | null,
}));

// A file system without hard links answers `link` with EPERM.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    linkSync: (existing: string, path: string) => {
      if (links.error !== null) {
        if (links.winner !== null) {
          actual.writeFileSync(links.winner.path, links.winner.key);
        }
        throw Object.assign(new Error(links.error), { code: links.error });
      }
      actual.linkSync(existing, path);
    },
  };
});

const { loadSecret } = await import('../src/auth/secret.js');

beforeEach(() => {
  links.error = null;
  links.winner = null;
});

const scratch = () => mkdtempSync(join(tmpdir(), 'owl-secret-'));

// What Node calls errno 95 depends on the platform: ENOTSUP on Linux, where
// EOPNOTSUPP is the same number and never appears as a name.
const platformNames = [
  ...new Set(
    [constants.errno.ENOTSUP, constants.errno.EOPNOTSUPP].map((errno) =>
      getSystemErrorName(-errno)
    )
  ),
];

describe('loadSecret on a file system without hard links', () => {
  it.each(['EPERM', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP'])(
    'writes the key directly after %s, and leaves no temporary file',
    (code) => {
      links.error = code;
      const dir = mkdtempSync(join(tmpdir(), 'owl-secret-'));
      const first = loadSecret(dir, null);
      expect(first).toHaveLength(32);
      expect(readdirSync(dir)).toEqual(['secret.key']);
      expect(loadSecret(dir, null).equals(first)).toBe(true);
    }
  );

  it.each(platformNames)(
    'writes the key directly after %s, the name Node reports on this platform',
    (code) => {
      links.error = code;
      const dir = scratch();
      const first = loadSecret(dir, null);
      expect(first).toHaveLength(32);
      expect(readdirSync(dir)).toEqual(['secret.key']);
      expect(loadSecret(dir, null).equals(first)).toBe(true);
    }
  );

  it.runIf(process.platform === 'linux')(
    'names errno 95 ENOTSUP on Linux, never EOPNOTSUPP',
    () => {
      expect(getSystemErrorName(-95)).toBe('ENOTSUP');
      expect(platformNames).toContain('ENOTSUP');
    }
  );

  it.each(['EPERM', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP'])(
    'keeps a key that is there already after %s',
    (code) => {
      links.error = code;
      const dir = scratch();
      const key = Buffer.alloc(32, 5).toString('base64');
      writeFileSync(join(dir, 'secret.key'), key);
      expect(loadSecret(dir, null).toString('base64')).toBe(key);
      expect(readFileSync(join(dir, 'secret.key'), 'utf8')).toBe(key);
      expect(readdirSync(dir)).toEqual(['secret.key']);
    }
  );

  it.each(['EPERM', 'ENOTSUP'])(
    'reads the key of a process that wins the race between %s and the write',
    (code) => {
      links.error = code;
      const dir = scratch();
      const key = Buffer.alloc(32, 9).toString('base64');
      links.winner = { path: join(dir, 'secret.key'), key };
      expect(loadSecret(dir, null).toString('base64')).toBe(key);
      expect(readFileSync(join(dir, 'secret.key'), 'utf8')).toBe(key);
      expect(readdirSync(dir)).toEqual(['secret.key']);
    }
  );

  it('returns the key that the fallback wrote to the file', () => {
    links.error = 'ENOTSUP';
    const dir = scratch();
    const secret = loadSecret(dir, null);
    const stored = readFileSync(join(dir, 'secret.key'), 'utf8');
    expect(Buffer.from(stored, 'base64').equals(secret)).toBe(true);
  });

  it.each(['EIO', 'EACCES', 'ENOENT'])(
    'passes on any other error from the link (%s) and leaves nothing behind',
    (code) => {
      links.error = code;
      const dir = scratch();
      expect(() => loadSecret(dir, null)).toThrow(new RegExp(code));
      expect(readdirSync(dir)).toEqual([]);
    }
  );
});
