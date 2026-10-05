import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

/** The declarations of the block that starts at `opening` (no nested braces). */
function declarations(opening: string): string[] {
  const start = css.indexOf(opening);
  expect(start, opening).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return body
    .split(';')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

describe('the dark palette', () => {
  // It has to be written twice, for `prefers-color-scheme` and for the explicit
  // choice: CSS has no way to share a block between a media query and an
  // attribute selector, and `light-dark()` would drop the plain light block
  // the link picture's colours are checked against.
  const system = declarations(":root:not([data-theme='light']) {");
  const chosen = declarations(":root[data-theme='dark'] {");

  it('is the same whether the system or the reader chooses it', () => {
    expect(system.length).toBeGreaterThan(20);
    expect(system).toEqual(chosen);
  });

  it('has a dark value for every colour token of the light theme', () => {
    const light = declarations(':root {')
      .map((line) => line.split(':')[0]!.trim())
      .filter((name) => name.startsWith('--owl-') && name !== '--owl-hatch');
    const dark = new Set(system.map((line) => line.split(':')[0]!.trim()));
    expect(light.filter((name) => !dark.has(name))).toEqual([]);
  });
});

describe('the maybe hatching', () => {
  it('is one gradient, shared by the swatches and the calendar cell', () => {
    expect(css.match(/repeating-linear-gradient\(/g)).toHaveLength(1);
    expect(css.match(/background-image: var\(--owl-hatch\)/g)).toHaveLength(2);
  });
});
