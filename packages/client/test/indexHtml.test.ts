import { APP_NAME, TAGLINES } from '@owl/shared';
import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';

/**
 * The block between the `owl:head` markers is what the server swaps for every
 * page; what is left of it serves the dev server and a raw `/index.html`. It
 * must not carry texts of its own that can drift from the shared ones.
 */
const block = html.slice(
  html.indexOf('<!--owl:head-->'),
  html.indexOf('<!--/owl:head-->')
);

describe('index.html head block', () => {
  it('is delimited by both markers, once', () => {
    expect(html.split('<!--owl:head-->')).toHaveLength(2);
    expect(html.split('<!--/owl:head-->')).toHaveLength(2);
    expect(block.length).toBeGreaterThan(0);
  });

  it('titles the page like the server titles the English start page', () => {
    expect(block).toContain(`<title>${APP_NAME} — ${TAGLINES.en}</title>`);
  });

  it('holds no description of its own', () => {
    expect(block).not.toContain('name="description"');
  });
});
