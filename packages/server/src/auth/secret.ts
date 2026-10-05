import { randomBytes } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  linkSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';

/**
 * The key participant tokens are signed with.
 *
 * Kept in its own file beside the database rather than inside it, so a copy of
 * the database alone — a backup, a support request — contains nothing that
 * would let anyone mint a token. `OWL_SECRET` overrides it for instances
 * without a persistent disk.
 *
 * Created on first start from a complete temporary file that is linked into
 * place, which fails if the key exists already. Two processes starting at once
 * cannot each create a different one — the loser reads the winner's — and a
 * crash or a full disk cannot leave a key file that is empty or cut short.
 */
export function loadSecret(dataDir: string, override: string | null): Buffer {
  if (override !== null) return Buffer.from(override, 'utf8');
  const path = join(dataDir, 'secret.key');
  create(path, randomBytes(32).toString('base64'));
  const secret = Buffer.from(readFileSync(path, 'utf8').trim(), 'base64');
  if (secret.length < 32) {
    throw new Error(
      `${path} is shorter than 32 bytes; delete it to create a new one`
    );
  }
  return secret;
}

/** Put `content` at `path` unless a file is there already. */
function create(path: string, content: string): void {
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}`;
  try {
    const fd = openSync(temporary, 'wx', 0o600);
    try {
      writeSync(fd, content);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    linkSync(temporary, path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') return;
    // A file system without hard links: fall back on the exclusive write.
    if (code === 'EPERM' || code === 'ENOSYS' || code === 'EOPNOTSUPP') {
      try {
        writeFileSync(path, content, { flag: 'wx', mode: 0o600 });
      } catch (second) {
        if ((second as NodeJS.ErrnoException).code !== 'EEXIST') throw second;
      }
      return;
    }
    throw error;
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
      // never created, or already gone
    }
  }
}
