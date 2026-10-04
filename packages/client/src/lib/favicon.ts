/** The app's own icon, the owl. */
export const OWL_ICON = '/favicon.svg';

/**
 * Point the browser tab's icon at `href`.
 *
 * The app changes pages without reloading, so the icon the server put into the
 * page — the owl, or the emoji of the event that was opened first — would
 * otherwise stay while the title moves on. There is one icon link; it is
 * updated in place, or added if the page has none.
 */
export function setFavicon(href: string): void {
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]');
  let link = links[0];
  for (const extra of [...links].slice(1)) extra.remove();
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.append(link);
  }
  if (link.getAttribute('href') === href) return;
  link.href = href;
  // The owl and every emoji icon are SVGs.
  link.type = 'image/svg+xml';
}
