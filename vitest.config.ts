import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * One project per package, plus one for the scripts, all in Node and all in-process: the server tests
 * open SQLite in memory and talk to Fastify through `inject`, so the whole
 * suite needs nothing installed and nothing running.
 *
 * The client's components are exercised by the end-to-end suite in a real
 * browser. What is measured here is its `lib/` — the logic that happens to be
 * reached from React — which runs in Node like everything else.
 */
export default defineConfig({
  // Test the sources, never a stale build of them. The projects extend this
  // config; an alias of their own would only give each its own Vite server.
  resolve: {
    alias: {
      '@owl/shared': fileURLToPath(
        new URL('./packages/shared/src/index.ts', import.meta.url)
      ),
    },
  },
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          environment: 'node',
          include: ['packages/shared/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['packages/server/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'client',
          environment: 'node',
          include: ['packages/client/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'scripts',
          environment: 'node',
          include: ['scripts/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: [
        'packages/shared/src/**',
        'packages/server/src/**',
        'packages/client/src/lib/**',
      ],
      // The process entry points are run, not imported: the end-to-end suite
      // starts index.ts, and cli.ts only hands over to commands.ts, which the
      // server tests cover.
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
