import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Every run starts with an empty database. */
export default function globalSetup(): void {
  rmSync(fileURLToPath(new URL('./.tmp/data', import.meta.url)), {
    recursive: true,
    force: true,
  });
}
