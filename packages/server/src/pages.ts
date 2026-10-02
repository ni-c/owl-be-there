import { createHash } from 'node:crypto';
import {
  EMOJIS,
  formatDayRange,
  LOCALES,
  SERVER_TEXTS,
  type EventSnapshotData,
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

  render(head: string): string {
    return `${this.before}${head}${this.after}`;
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
  description: string;
  imageAlt: string;
  noindex: boolean;
  icon: string;
}

function head(options: HeadOptions): string {
  const e = escapeHtml;
  const image = `${options.publicUrl}/og.png`;
  return [
    `<title>${e(options.title)}</title>`,
    `<meta name="description" content="${e(options.description)}" />`,
    options.noindex ? '<meta name="robots" content="noindex, nofollow" />' : '',
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Owl Be There" />`,
    `<meta property="og:title" content="${e(options.title)}" />`,
    `<meta property="og:description" content="${e(options.description)}" />`,
    `<meta property="og:url" content="${e(options.publicUrl + options.path)}" />`,
    `<meta property="og:image" content="${e(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${e(options.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<link rel="icon" href="${e(options.icon)}" />`,
  ]
    .filter(Boolean)
    .join('\n    ');
}

/** The head for every page that is not an event. */
export function defaultHead(publicUrl: string, path: string): string {
  const texts = SERVER_TEXTS.en;
  return head({
    publicUrl,
    path,
    title: `${texts.appName} — ${texts.tagline}`,
    description:
      'Mark the days you can make it on a calendar and see at a glance when the whole group is free. No sign-up, no tracking.',
    imageAlt: texts.previewImageAlt,
    noindex: false,
    icon: '/favicon.svg',
  });
}

/** An emoji as a favicon: an SVG with one text element, as a data URL. */
export function emojiIcon(emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
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
    title: `${emoji} ${event.title}`,
    description,
    imageAlt: texts.previewImageAlt,
    noindex: true,
    icon: emojiIcon(emoji),
  });
}
