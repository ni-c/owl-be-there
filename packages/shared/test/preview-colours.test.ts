import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PREVIEW_COLOURS } from '../src/index.js';

const STYLES = fileURLToPath(
  new URL('../../client/src/styles.css', import.meta.url)
);

/** The custom properties of the first `:root { … }` block — the light theme. */
function lightTheme(): Map<string, string> {
  const css = readFileSync(STYLES, 'utf8');
  const start = css.indexOf(':root {');
  const block = css.slice(start, css.indexOf('}', start));
  return new Map(
    [...block.matchAll(/--owl-([\w-]+):\s*(#[0-9a-f]{6})\s*;/g)].map((m) => [
      m[1]!,
      m[2]!,
    ])
  );
}

describe('the link picture colours', () => {
  const theme = lightTheme();

  it('read the light theme of the stylesheet', () => {
    expect(theme.size).toBeGreaterThan(20);
  });

  it('are the stylesheet colours, name for name', () => {
    const { heat, heatInkLow, heatInkHigh, ...plain } = PREVIEW_COLOURS;
    for (const [name, value] of Object.entries(plain))
      expect(value, name).toBe(theme.get(name));
    expect(heatInkLow).toBe(theme.get('heat-ink-low'));
    expect(heatInkHigh).toBe(theme.get('heat-ink-high'));
    expect(heat).toEqual(heat.map((_, step) => theme.get(`heat-${step}`)));
  });

  it('have a heat step for every step of the stylesheet, and no more', () => {
    const steps = [...theme.keys()].filter((name) => /^heat-\d+$/.test(name));
    expect(steps).toHaveLength(PREVIEW_COLOURS.heat.length);
  });
});
