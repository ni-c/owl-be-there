import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The key participant tokens are signed with.
 *
 * Kept in its own file beside the database rather than inside it, so a copy of
 * the database alone — a backup, a support request — contains nothing that
 * would let anyone mint a token. `OWL_SECRET` overrides it for instances
 * without a persistent disk.
 *
 * Created on first start with an exclusive write, so two processes starting at
 * once cannot each create a different one: the loser reads the winner's.
 */
export function loadSecret(dataDir: string, override: string | null): Buffer {
  if (override !== null) return Buffer.from(override, 'utf8');
  const path = join(dataDir, 'secret.key');
  try {
    writeFileSync(path, randomBytes(32).toString('base64'), {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const secret = Buffer.from(readFileSync(path, 'utf8').trim(), 'base64');
  if (secret.length < 32) {
    throw new Error(
      `${path} is shorter than 32 bytes; delete it to create a new one`
    );
  }
  return secret;
}
