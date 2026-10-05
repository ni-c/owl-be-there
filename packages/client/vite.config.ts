import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // The sources, not a build: the client is bundled from them directly.
      '@owl/shared': fileURLToPath(
        new URL('../shared/src/index.ts', import.meta.url)
      ),
    },
  },
  server: {
    port: 5173,
    // The API runs beside the dev server; see `npm run dev`. Share links are
    // built on the API's PUBLIC_URL (http://localhost:8080 by default), which
    // serves no pages in development: put PUBLIC_URL=http://localhost:5173 in
    // the .env at the repository root to make them open the dev server.
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
  build: {
    target: 'es2022',
    // A source map would be a publicly fetchable copy of the sources.
    sourcemap: false,
  },
});
