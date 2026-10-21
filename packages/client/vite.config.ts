import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // The API's port: PORT from the repository's .env, as the server reads it.
  const env = loadEnv(
    mode,
    fileURLToPath(new URL('../..', import.meta.url)),
    ''
  );
  const apiPort = env.PORT?.trim() || '8080';
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      // The sources, not a build: the client is bundled from them directly. Two
      // patterns, as a plain string would also rewrite `@owl/shared/home/fa`.
      alias: [
        {
          find: /^@owl\/shared$/,
          replacement: fileURLToPath(
            new URL('../shared/src/index.ts', import.meta.url)
          ),
        },
        {
          find: /^@owl\/shared\/(.+)$/,
          replacement: `${fileURLToPath(new URL('../shared/src/', import.meta.url))}$1.ts`,
        },
      ],
    },
    server: {
      port: 5173,
      // Fail rather than move to another port: share links and the e2e setup expect 5173.
      strictPort: true,
      // The API runs beside the dev server; see `npm run dev`. Share links are
      // built on the API's PUBLIC_URL (http://localhost:8080 by default), which
      // serves no pages in development: put PUBLIC_URL=http://localhost:5173 in
      // the .env at the repository root to make them open the dev server.
      proxy: { '/api': `http://127.0.0.1:${apiPort}` },
    },
    build: {
      target: 'es2022',
      // A source map would be a publicly fetchable copy of the sources.
      sourcemap: false,
      // dist/.vite/manifest.json: the server reads which chunk holds which
      // language. It is never served, being a dotfile directory.
      manifest: true,
    },
  };
});
