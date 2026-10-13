import { run } from './commands.js';

// The commands, and what they do, are described in `commands.ts`.
// Not process.exit(): it would discard output a pipe has not taken yet.
process.exitCode = run(process.argv.slice(2));
