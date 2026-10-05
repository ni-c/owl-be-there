import { run } from './commands.js';

// The commands, and what they do, are described in `commands.ts`.
process.exit(run(process.argv.slice(2)));
