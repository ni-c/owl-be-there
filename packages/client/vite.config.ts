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
    // The API runs beside the dev server; see `npm run dev`.
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
  build: {
    target: 'es2022',
    // A source map would be a publicly fetchable copy of the sources.
    sourcemap: false,
  },
});
