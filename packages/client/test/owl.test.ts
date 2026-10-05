import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Owl } from '../src/components/Owl.tsx';

const render = (mood: NonNullable<Parameters<typeof Owl>[0]['mood']>) =>
  renderToStaticMarkup(createElement(Owl, { mood }));

/** The eye circles of the face (the body has others, with other radii). */
const eyes = (markup: string) => markup.match(/<circle[^>]*r="15"[^>]*>/g);

describe('Owl eyes', () => {
  it('draws a sleeping owl with two round eyes and two sagging lids', () => {
    const markup = render('sleeping');
    expect(eyes(markup)).toHaveLength(2);
    expect(markup).toContain('Q42 58');
    expect(markup).toContain('Q78 58');
    expect(markup).not.toContain('Q42 44');
  });

  it('draws a celebrating owl with two round eyes and two arched lids', () => {
    const markup = render('celebrating');
    expect(eyes(markup)).toHaveLength(2);
    expect(markup).toContain('Q42 44');
    expect(markup).toContain('Q78 44');
    expect(markup).not.toContain('Q42 58');
  });

  it('leaves the lids to the sleeping and celebrating moods', () => {
    for (const mood of ['happy', 'thinking', 'confused'] as const) {
      expect(render(mood)).toContain('owl-eyes');
      expect(render(mood)).not.toContain('Q42 58');
      expect(render(mood)).not.toContain('Q42 44');
    }
  });
});
