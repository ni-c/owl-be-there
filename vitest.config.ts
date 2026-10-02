import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Test the sources, never a stale build of them.
const alias = {
  '@owl/shared': fileURLToPath(
    new URL('./packages/shared/src/index.ts', import.meta.url)
  ),
};

/**
 * One project per package, all in Node and all in-process: the server tests
 * open SQLite in memory and talk to Fastify through `inject`, so the whole
 * suite needs nothing installed and nothing running.
 *
 * The client's components are exercised by the end-to-end suite in a real
 * browser. What is measured here is its `lib/` — the logic that happens to be
 * reached from React — which runs in Node like everything else.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'shared',
          environment: 'node',
          include: ['packages/shared/test/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'server',
          environment: 'node',
          include: ['packages/server/test/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'client',
          environment: 'node',
          include: ['packages/client/test/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: [
        'packages/shared/src/**',
        'packages/server/src/**',
        'packages/client/src/lib/**',
      ],
      // The process entry point and the operator command line are run, not
      // imported; the end-to-end suite and the container check cover them.
      exclude: ['packages/server/src/index.ts', 'packages/server/src/cli.ts'],
      // A floor, never lowered: set just below what the suites reach, so a
      // change that adds untested code is noticed in the pull request.
      thresholds: {
        statements: 98,
        branches: 95,
        functions: 98,
        lines: 98,
      },
    },
  },
});
