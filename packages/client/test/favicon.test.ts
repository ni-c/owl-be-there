import { emojiIcon } from '@owl/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OWL_ICON, setFavicon } from '../src/lib/favicon.ts';

/** A head that holds link elements, as much of the DOM as `setFavicon` needs. */
function installHead(hrefs: string[]) {
  const links: FakeLink[] = [];
  class FakeLink {
    rel = '';
    type = '';
    private value: string | null = null;
    get href(): string {
      return this.value ?? '';
    }
    set href(value: string) {
      this.value = value;
    }
    getAttribute(name: string): string | null {
      return name === 'href' ? this.value : null;
    }
    remove(): void {
      links.splice(links.indexOf(this), 1);
    }
  }
  for (const href of hrefs) {
    const link = new FakeLink();
    link.rel = 'icon';
    link.href = href;
    links.push(link);
  }
  vi.stubGlobal('document', {
    head: { append: (link: FakeLink) => links.push(link) },
    createElement: () => new FakeLink(),
    querySelectorAll: () => [...links],
  });
  return links;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('setFavicon', () => {
  it('points the existing icon at an event emoji and back at the owl', () => {
    const links = installHead([OWL_ICON]);
    setFavicon(emojiIcon('⚽'));
    expect(links).toHaveLength(1);
    expect(links[0]!.href).toBe(emojiIcon('⚽'));
    expect(links[0]!.type).toBe('image/svg+xml');
    setFavicon(OWL_ICON);
    expect(links[0]!.href).toBe(OWL_ICON);
  });

  it('follows one event to the next', () => {
    const links = installHead([emojiIcon('⚽')]);
    setFavicon(emojiIcon('🍕'));
    expect(links.map((link) => link.href)).toEqual([emojiIcon('🍕')]);
  });

  it('adds an icon to a page that has none', () => {
    const links = installHead([]);
    setFavicon(OWL_ICON);
    expect(links).toHaveLength(1);
    expect(links[0]!.rel).toBe('icon');
    expect(links[0]!.href).toBe(OWL_ICON);
  });

  it('leaves one icon where there were several', () => {
    const links = installHead([OWL_ICON, emojiIcon('⚽'), emojiIcon('🎲')]);
    setFavicon(emojiIcon('🍕'));
    expect(links.map((link) => link.href)).toEqual([emojiIcon('🍕')]);
  });

  it('does not touch an icon that is already right', () => {
    const links = installHead([OWL_ICON]);
    links[0]!.type = 'kept';
    setFavicon(OWL_ICON);
    expect(links[0]!.type).toBe('kept');
  });
});
