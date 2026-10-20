import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Button,
  buttonClass,
  type ButtonSize,
  type ButtonVariant,
} from '../src/components/ui.tsx';

// Records, so that a variant or a size added to the type fails to compile here
// until its classes are listed.
const VARIANT_CLASSES: Record<ButtonVariant, string[]> = {
  primary: [
    'bg-brand',
    'text-brand-ink',
    'hover:bg-brand-hover',
    'shadow-card',
  ],
  secondary: ['bg-surface', 'text-ink', 'border-2', 'hover:border-line-strong'],
  danger: ['bg-danger', 'text-danger-ink', 'hover:opacity-90'],
  dangerOutline: ['bg-surface', 'text-danger', 'hover:border-danger'],
};
const SIZE_CLASSES: Record<ButtonSize, string[]> = {
  sm: ['min-h-11', 'px-3', 'text-sm', 'gap-1.5'],
  md: ['min-h-11', 'px-4', 'gap-2'],
  lg: ['min-h-13', 'px-6', 'text-lg', 'gap-2'],
};
const BASE = [
  'inline-flex',
  'items-center',
  'justify-center',
  'rounded-full',
  'font-bold',
  'transition',
  'disabled:cursor-not-allowed',
  'disabled:opacity-50',
];

const variants = Object.keys(VARIANT_CLASSES) as ButtonVariant[];
const sizes = Object.keys(SIZE_CLASSES) as ButtonSize[];
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean);

/** The class attribute of the one element a render produces. */
function renderedClass(props: Parameters<typeof Button>[0] = {}): string {
  const html = renderToStaticMarkup(createElement(Button, props));
  const match = /^<button [^>]*class="([^"]*)"/.exec(html);
  expect(match, html).not.toBeNull();
  return match![1]!.trim();
}

describe('buttonClass', () => {
  it('holds the shared base, the size and the variant, for every combination', () => {
    for (const variant of variants) {
      for (const size of sizes) {
        const found = tokens(buttonClass(variant, size));
        for (const expected of [
          ...BASE,
          ...SIZE_CLASSES[size],
          ...VARIANT_CLASSES[variant],
        ])
          expect(found, `${variant} ${size}`).toContain(expected);
      }
    }
  });

  it('gives each variant and each size a look of its own', () => {
    const byVariant = variants.map((variant) => buttonClass(variant, 'md'));
    expect(new Set(byVariant).size).toBe(variants.length);
    const bySize = sizes.map((size) => buttonClass('primary', size));
    expect(new Set(bySize).size).toBe(sizes.length);
  });

  it('carries nothing of the other sizes and variants', () => {
    const found = tokens(buttonClass('primary', 'md'));
    expect(found).not.toContain('px-3');
    expect(found).not.toContain('px-6');
    expect(found).not.toContain('text-lg');
    expect(found).not.toContain('border-2');
    expect(found).not.toContain('text-ink');
  });

  it('leaves no trailing or double space to spell a class around', () => {
    for (const variant of variants)
      for (const size of sizes) {
        const classes = buttonClass(variant, size);
        expect(classes, `${variant} ${size}`).toBe(
          classes.trim().replace(/\s+/g, ' ')
        );
      }
  });
});

describe('Button', () => {
  it('renders exactly the classes buttonClass gives, for every combination', () => {
    for (const variant of variants)
      for (const size of sizes)
        expect(renderedClass({ variant, size }), `${variant} ${size}`).toBe(
          buttonClass(variant, size)
        );
  });

  it('is a medium secondary button without props', () => {
    expect(renderedClass()).toBe(buttonClass('secondary', 'md'));
  });

  it('appends the class a caller adds, after the look', () => {
    expect(renderedClass({ variant: 'primary', className: 'w-full' })).toBe(
      `${buttonClass('primary', 'md')} w-full`
    );
  });

  it('is a plain button unless told otherwise', () => {
    expect(renderToStaticMarkup(createElement(Button))).toContain(
      'type="button"'
    );
    expect(
      renderToStaticMarkup(createElement(Button, { type: 'submit' }))
    ).toContain('type="submit"');
  });
});
