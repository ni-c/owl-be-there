/** `smooth` unless the reader asked for less motion. */
export function scrollBehavior(): ScrollBehavior {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return reduce ? 'auto' : 'smooth';
}

/** Scroll to the top of the page, without animation if the reader prefers. */
export function scrollToTop(): void {
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
}
