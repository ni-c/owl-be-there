import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const links = vi.hoisted(() => ({ error: null as string | null }));

// A file system without hard links answers `link` with EPERM.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    linkSync: (existing: string, path: string) => {
      if (links.error !== null) {
        throw Object.assign(new Error(links.error), { code: links.error });
      }
      actual.linkSync(existing, path);
    },
  };
});

const { loadSecret } = await import('../src/auth/secret.js');

beforeEach(() => {
  links.error = null;
});

describe('loadSecret on a file system without hard links', () => {
  it.each(['EPERM', 'ENOSYS', 'EOPNOTSUPP'])(
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

  it('keeps a key that is there already', () => {
    links.error = 'EPERM';
    const dir = mkdtempSync(join(tmpdir(), 'owl-secret-'));
    const key = Buffer.alloc(32, 5).toString('base64');
    writeFileSync(join(dir, 'secret.key'), key);
    expect(loadSecret(dir, null).toString('base64')).toBe(key);
    expect(readFileSync(join(dir, 'secret.key'), 'utf8')).toBe(key);
    expect(readdirSync(dir)).toEqual(['secret.key']);
  });

  it('passes on any other error from the link', () => {
    links.error = 'EIO';
    const dir = mkdtempSync(join(tmpdir(), 'owl-secret-'));
    expect(() => loadSecret(dir, null)).toThrow(/EIO/);
    expect(readdirSync(dir)).toEqual([]);
  });
});
