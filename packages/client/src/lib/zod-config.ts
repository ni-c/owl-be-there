import { z } from 'zod';

// Imported first: zod reads this when a schema is created, not when it parses.
// Otherwise it probes for eval with `Function('')`, which the CSP refuses.
z.config({ jitless: true });
