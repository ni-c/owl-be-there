/**
 * Preloaded with `node --import` so that a child process can run the
 * TypeScript sources the way Vitest does, without a build: `./x.js` finds
 * `x.ts` beside it, and `@owl/shared` is the package's source, not its `dist`.
 */
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const shared = new URL('../../shared/src/index.ts', import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@owl/shared') return { url: shared, shortCircuit: true };
    if (
      specifier.startsWith('.') &&
      specifier.endsWith('.js') &&
      context.parentURL !== undefined
    ) {
      const source = new URL(
        specifier.replace(/\.js$/, '.ts'),
        context.parentURL
      );
      if (existsSync(fileURLToPath(source))) {
        return { url: source.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});
