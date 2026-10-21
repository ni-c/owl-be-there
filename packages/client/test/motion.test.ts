import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollBehavior, scrollToTop } from '../src/lib/motion.ts';
import { installBrowser } from './browser.ts';

afterEach(() => vi.unstubAllGlobals());

describe('scrollBehavior', () => {
  it('is smooth where there is no matchMedia, or no window at all', () => {
    expect(scrollBehavior()).toBe('smooth');
    const { window } = installBrowser();
    expect(scrollBehavior()).toBe('smooth');
    scrollToTop();
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth',
    });
  });

  it('is instant when the reader prefers reduced motion', () => {
    const { window } = installBrowser();
    const matchMedia = vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
    }));
    Object.assign(window, { matchMedia });
    expect(scrollBehavior()).toBe('auto');
    scrollToTop();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });

  it('is smooth when the preference is not set', () => {
    const { window } = installBrowser();
    Object.assign(window, { matchMedia: () => ({ matches: false }) });
    expect(scrollBehavior()).toBe('smooth');
  });
});
