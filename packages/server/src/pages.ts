import { createHash } from 'node:crypto';
import {
  EMOJIS,
  emojiIcon,
  formatDayRange,
  LANGUAGES,
  LOCALES,
  SERVER_TEXTS,
  type EventSnapshotData,
  type Language,
} from '@owl/shared';

/**
 * The client's `index.html`, with a replaceable block of head tags.
 *
 * Link previews in WhatsApp, Signal and the like are built by crawlers that
 * run no JavaScript, so an event's title has to be in the HTML the server
 * sends. The block between `<!--owl:head-->` and `<!--/owl:head-->` sits right
 * after `<meta charset>`, well inside the first kilobytes a crawler reads, and
 * the server swaps it for every page.
 */
export class PageTemplate {
  private readonly before: string;
  private readonly after: string;
  /** Hashes of the inline scripts, for the content security policy. */
  readonly scriptHashes: string[];

  constructor(html: string) {
    const start = html.indexOf('<!--owl:head-->');
    const endMarker = '<!--/owl:head-->';
    const end = html.indexOf(endMarker);
    if (start === -1 || end === -1 || end < start) {
      throw new Error(
        'index.html has no <!--owl:head--> … <!--/owl:head--> block'
      );
    }
    this.before = html.slice(0, start);
    this.after = html.slice(end + endMarker.length);
    this.scriptHashes = inlineScriptHashes(html);
  }

  /**
   * The page with this head. `language` goes into `<html lang>`, so a search
   * engine reading `/de` sees a German page before any script runs.
   */
  render(head: string, language: Language = 'en'): string {
    const before = this.before.replace(
      /<html lang="[^"]*"/,
      `<html lang="${language}"`
    );
    return `${before}${head}${this.after}`;
  }
}

/**
 * The hashes of the inline scripts, as CSP source expressions.
 *
 * Read from the very file being served: an edited script changes its own
 * allowance, and an injected one is not on the list. Only meta, title and link
 * tags are ever put into the page, so the hashes stay valid.
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(
    /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi
  )) {
    if (!match[1]) continue;
    hashes.push(
      `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`
    );
  }
  return hashes;
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

interface HeadOptions {
  publicUrl: string;
  path: string;
  title: string;
  /** The title for link previews, where no favicon is shown; defaults to `title`. */
  ogTitle?: string;
  description: string;
  /** Absolute; the general picture of the owl when left out. */
  image?: string;
  imageAlt: string;
  noindex: boolean;
  icon: string;
  /** Announce the start page in every language, for search engines. */
  alternates?: boolean;
}

/**
 * The start page in one language: `/de`, `/fr` and so on. Plain `/` picks the
 * visitor's language in the browser and is the `x-default`.
 */
export function homePath(language: Language | null): string {
  return language === null ? '/' : `/${language}`;
}

function head(options: HeadOptions): string {
  const e = escapeHtml;
  const image = options.image ?? `${options.publicUrl}/og.png`;
  return [
    `<title>${e(options.title)}</title>`,
    `<meta name="description" content="${e(options.description)}" />`,
    options.noindex ? '<meta name="robots" content="noindex, nofollow" />' : '',
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Owl Be There" />`,
    `<meta property="og:title" content="${e(options.ogTitle ?? options.title)}" />`,
    `<meta property="og:description" content="${e(options.description)}" />`,
    `<meta property="og:url" content="${e(options.publicUrl + options.path)}" />`,
    `<meta property="og:image" content="${e(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${e(options.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<link rel="icon" href="${e(options.icon)}" />`,
    ...(options.alternates
      ? [
          `<link rel="canonical" href="${e(options.publicUrl + options.path)}" />`,
          ...LANGUAGES.map(
            (language) =>
              `<link rel="alternate" hreflang="${language}" href="${e(options.publicUrl + homePath(language))}" />`
          ),
          `<link rel="alternate" hreflang="x-default" href="${e(options.publicUrl + homePath(null))}" />`,
        ]
      : []),
  ]
    .filter(Boolean)
    .join('\n    ');
}

/** The head for every page that is not an event, in English unless told. */
export function defaultHead(
  publicUrl: string,
  path: string,
  options: { language?: Language; alternates?: boolean } = {}
): string {
  const texts = SERVER_TEXTS[options.language ?? 'en'];
  return head({
    publicUrl,
    path,
    title: `${texts.appName} — ${texts.tagline}`,
    description: texts.description,
    imageAlt: texts.previewImageAlt,
    noindex: false,
    icon: '/favicon.svg',
    alternates: options.alternates ?? false,
  });
}

/**
 * The sitemap: the start page in every language, each naming the others, and
 * the privacy page. Event pages are private and never listed.
 */
export function sitemap(publicUrl: string): string {
  const e = escapeHtml;
  const alternates = [
    ...LANGUAGES.map(
      (language) =>
        `    <xhtml:link rel="alternate" hreflang="${language}" href="${e(publicUrl + homePath(language))}" />`
    ),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${e(publicUrl + homePath(null))}" />`,
  ].join('\n');
  const home = [null, ...LANGUAGES].map(
    (language) =>
      `  <url>\n    <loc>${e(publicUrl + homePath(language))}</loc>\n${alternates}\n  </url>`
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...home,
    `  <url>\n    <loc>${e(publicUrl)}/privacy</loc>\n  </url>`,
    '</urlset>',
    '',
  ].join('\n');
}

/** `robots.txt`, pointing at the sitemap under the public address. */
export function robotsTxt(publicUrl: string): string {
  return [
    '# Event pages say `noindex` themselves, and crawlers that build link previews',
    '# must be able to read them. Only the API is off limits.',
    'User-agent: *',
    'Disallow: /api/',
    '',
    `Sitemap: ${publicUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

/**
 * The head of an event page. The title and fixed sentences only: whatever the
 * organiser wrote as a description stays inside the page, so a preview can
 * never carry text somebody wrote to lure strangers.
 */
export function eventHead(publicUrl: string, data: EventSnapshotData): string {
  const { event } = data;
  const texts = SERVER_TEXTS[event.language];
  const emoji = EMOJIS[event.emoji];
  const answers = data.participants.filter((p) => p.answered).length;
  const description =
    event.finalStart !== null && event.finalEnd !== null
      ? texts.previewDecided(
          formatDayRange(
            event.finalStart,
            event.finalEnd,
            LOCALES[event.language]
          )
        )
      : texts.previewOpen(answers);
  return head({
    publicUrl,
    path: `/e/${event.id}`,
    // The tab shows the emoji as its icon; in the title it would appear twice.
    title: `${event.title} · ${texts.appName}`,
    ogTitle: `${emoji} ${event.title}`,
    description,
    // The version in the address: a changed poll is a new picture to caches
    // that keep one per URL.
    image: `${publicUrl}/e/${event.id}/og.png?v=${event.version}`,
    imageAlt: texts.previewCalendarAlt,
    noindex: true,
    icon: emojiIcon(emoji),
  });
}
