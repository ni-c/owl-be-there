import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../src/app.js';
import {
  emojiIcon,
  escapeMarkup,
  FAQ_TOPICS,
  HOME_TEXTS,
  LANGUAGES,
  SERVER_TEXTS,
} from '@owl/shared';
import { snapshot } from '../src/db/repo.js';
import { jsonLd, PageTemplate } from '../src/pages.js';
import { PreviewRenderer } from '../src/preview.js';
import {
  CLIENT_DIR,
  createEvent,
  eventBody,
  join,
  mark,
  testApp,
  WEEKEND,
  type TestApp,
  adminHeaders,
  setStatus,
  sessionRequest,
} from './helpers.js';

let t: TestApp | undefined;
afterEach(async () => {
  await t?.app.close();
  t = undefined;
});

/** Everything the built-in legal notice needs; all of it fictional. */
const IMPRINT_ENV = {
  OPERATOR_NAME: 'Example Org',
  OPERATOR_ADDRESS: 'Musterstraße 1, 12345 Musterstadt, Germany',
  OPERATOR_CONTACT: 'privacy@example.org',
};

const hashOf = (script: string): string =>
  `'sha256-${createHash('sha256').update(script).digest('base64')}'`;

describe('security headers', () => {
  it('are on every answer, with the inline script allowed by hash', async () => {
    t = await testApp();
    const response = await t.app.inject({ method: 'GET', url: '/' });
    expect(response.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
      'cross-origin-opener-policy': 'same-origin',
      'strict-transport-security': 'max-age=31536000',
    });
    const csp = response.headers['content-security-policy'] as string;
    expect(csp).toContain(
      hashOf("\n      document.documentElement.dataset.ready = 'yes';\n    ")
    );
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
  });

  it('leave out HSTS on plain HTTP', async () => {
    t = await testApp({ env: { PUBLIC_URL: 'http://localhost:8080' } });
    const response = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('build a policy that denies everything external', () => {
    expect(contentSecurityPolicy([])).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"
    );
  });
});

describe('pages', () => {
  it('serves the app with the default head on / and /privacy', async () => {
    t = await testApp();
    for (const url of ['/', '/privacy']) {
      const response = await t.app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(response.body).toContain(
        '<meta property="og:image" content="https://owl.example.org/og.png" />'
      );
      expect(response.body).toContain(
        `<meta property="og:url" content="https://owl.example.org${url}" />`
      );
      expect(response.body).not.toContain('<!--owl:head-->');
    }
  });

  it('serves /imprint with the default head, with and without a slash, once the notice is configured', async () => {
    t = await testApp({ env: IMPRINT_ENV });
    for (const [url, path] of [
      ['/imprint', '/imprint'],
      ['/imprint/', '/imprint'],
    ] as const) {
      for (const method of ['GET', 'HEAD'] as const) {
        const response = await t.app.inject({ method, url });
        expect(response.statusCode, `${method} ${url}`).toBe(200);
        expect(response.headers['content-type']).toBe(
          'text/html; charset=utf-8'
        );
        if (method === 'GET') {
          expect(response.body).toContain(
            `<meta property="og:url" content="https://owl.example.org${path}" />`
          );
          expect(response.body).not.toContain('noindex');
          expect(response.body).not.toContain('<!--owl:head-->');
        }
      }
    }
  });

  it('knows no /imprint unless name, address and contact are all set', async () => {
    const partial: Record<string, string>[] = [
      {},
      { OPERATOR_NAME: 'Example Org' },
      { OPERATOR_NAME: 'Example Org', OPERATOR_ADDRESS: 'Musterstraße 1' },
      { OPERATOR_NAME: 'Example Org', OPERATOR_CONTACT: 'privacy@example.org' },
      {
        OPERATOR_ADDRESS: 'Musterstraße 1',
        OPERATOR_CONTACT: 'privacy@example.org',
      },
      // An external notice does not create the built-in page.
      { IMPRINT_URL: 'https://example.org/imprint' },
    ];
    for (const env of partial) {
      t = await testApp({ env });
      for (const url of ['/imprint', '/imprint/']) {
        const response = await t.app.inject({ method: 'GET', url });
        expect(response.statusCode, `${url} with ${JSON.stringify(env)}`).toBe(
          404
        );
      }
      const sitemap = await t.app.inject({
        method: 'GET',
        url: '/sitemap.xml',
      });
      expect(sitemap.body).not.toContain('/imprint');
      await t.app.close();
    }
    t = undefined;
  });

  it('puts the event title in the head, escaped, and never the description', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app, {
      title: '</title><script>alert(1)</script>',
      description: 'Visit https://phish.example to claim a prize',
    });
    const response = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(response.body).toContain(
      '&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;'
    );
    expect(response.body).not.toContain('<script>alert(1)');
    expect(response.body).not.toContain('phish');
    expect(response.body).toContain(
      '<meta name="robots" content="noindex, nofollow" />'
    );
    expect(response.body).toContain('Add the days you can make it');
    // The head sits within the first kilobytes a preview crawler reads.
    expect(response.body.indexOf('og:title')).toBeLessThan(2048);
  });

  it('shows the emoji as the tab icon and keeps it out of the title', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app, { title: 'Kick-off' });
    const body = (await t.app.inject({ method: 'GET', url: `/e/${id}` })).body;
    expect(body).toContain('<title>Kick-off · Owl Be There</title>');
    // A link preview has no icon, so it keeps the emoji.
    expect(body).toContain(
      '<meta property="og:title" content="⚽ Kick-off" />'
    );
    expect(body).toContain(`<link rel="icon" href="${emojiIcon('⚽')}" />`);
  });

  it('counts answers and announces a chosen date in the preview, in the event language', async () => {
    t = await testApp();
    const { id, adminToken } = await createEvent(t.app, { language: 'de' });
    const max = await join(t.app, id, 'Max');
    await mark(t.app, id, max, WEEKEND);
    expect(
      (await t.app.inject({ method: 'GET', url: `/e/${id}` })).body
    ).toContain('bisher 1 Antwort');
    await setStatus(t.app, id, adminToken, {
      status: 'finalized',
      start: '2027-03-06',
    });
    expect(
      (await t.app.inject({ method: 'GET', url: `/e/${id}` })).body
    ).toMatch(/Der Termin steht: Sa\., 6\. März 2027/);
  });

  it('previews Spanish events in Spanish', async () => {
    t = await testApp();
    const { id, adminToken } = await createEvent(t.app, { language: 'es' });
    const open = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(open.body).toContain('Marca los días que te vienen bien');
    await setStatus(t.app, id, adminToken, {
      status: 'finalized',
      start: '2027-03-06',
    });
    const decided = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(decided.body).toContain('Ya hay fecha: sáb, 6 de marzo de 2027');
  });

  it('previews French events in French', async () => {
    t = await testApp();
    const { id, adminToken } = await createEvent(t.app, { language: 'fr' });
    const open = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(open.body).toContain('Indique les jours où tu es libre');
    await setStatus(t.app, id, adminToken, {
      status: 'finalized',
      start: '2027-03-06',
    });
    const decided = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(decided.body).toContain('La date est fixée : sam. 6 mars 2027');
  });

  it('previews Portuguese events in Portuguese', async () => {
    t = await testApp();
    const { id, adminToken } = await createEvent(t.app, { language: 'pt' });
    const open = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(open.body).toContain('Marca os dias em que podes');
    await setStatus(t.app, id, adminToken, {
      status: 'finalized',
      start: '2027-03-06',
    });
    const decided = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(decided.body).toContain(
      'A data está marcada: sábado, 6 de março de 2027'
    );
  });

  it('previews Italian events in Italian', async () => {
    t = await testApp();
    const { id, adminToken } = await createEvent(t.app, { language: 'it' });
    const open = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(open.body).toContain('Segna i giorni in cui ci sei');
    await setStatus(t.app, id, adminToken, {
      status: 'finalized',
      start: '2027-03-06',
    });
    const decided = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(decided.body).toContain('La data è decisa: sab 6 marzo 2027');
  });

  it('previews Japanese events in Japanese', async () => {
    t = await testApp();
    const { id, adminToken } = await createEvent(t.app, { language: 'ja' });
    const open = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(open.body).toContain('行ける日を選んでね');
    await setStatus(t.app, id, adminToken, {
      status: 'finalized',
      start: '2027-03-06',
    });
    const decided = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(decided.body).toContain('日程決定：2027年3月6日(土)');
  });

  it('previews Dutch events in Dutch', async () => {
    t = await testApp();
    const { id, adminToken } = await createEvent(t.app, { language: 'nl' });
    const open = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(open.body).toContain('Vul in wanneer je kunt');
    await setStatus(t.app, id, adminToken, {
      status: 'finalized',
      start: '2027-03-06',
    });
    const decided = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(decided.body).toContain('De datum staat vast: za 6 maart 2027');
  });

  describe('the preview of a closed poll', () => {
    const description = async (id: string): Promise<string> => {
      const body = (await t!.app.inject({ method: 'GET', url: `/e/${id}` }))
        .body;
      const match = /<meta property="og:description" content="([^"]*)"/.exec(
        body
      );
      if (!match) throw new Error('no og:description');
      return match[1]!;
    };

    it.each(LANGUAGES)(
      'says so in %s and no longer invites answers',
      async (language) => {
        t = await testApp();
        const { id, adminToken } = await createEvent(t.app, { language });
        const texts = SERVER_TEXTS[language];
        expect(await description(id)).toBe(escapeMarkup(texts.previewOpen(0)));
        await setStatus(t!.app, id, adminToken, { status: 'closed' });
        const closed = await description(id);
        expect(closed).toBe(escapeMarkup(texts.previewClosed));
        expect(closed).not.toBe(escapeMarkup(texts.previewOpen(0)));
      }
    );

    it('still announces the date of a decided poll, and goes back to the invitation when reopened', async () => {
      t = await testApp();
      const { id, adminToken } = await createEvent(t.app);
      await setStatus(t!.app, id, adminToken, { status: 'closed' });
      await setStatus(t!.app, id, adminToken, {
        status: 'finalized',
        start: '2027-03-06',
      });
      expect(await description(id)).toMatch(/^The date is set: /);
      await setStatus(t!.app, id, adminToken, { status: 'closed' });
      expect(await description(id)).toBe(SERVER_TEXTS.en.previewClosed);
      await setStatus(t!.app, id, adminToken, { status: 'open' });
      expect(await description(id)).toBe(
        'Add the days you can make it. No sign-up needed.'
      );
      const max = await join(t.app, id, 'Max');
      await mark(t.app, id, max, WEEKEND);
      expect(await description(id)).toContain('1 answer so far');
    });
  });

  it('serves the start page in every language, in that language', async () => {
    t = await testApp();
    const german = await t.app.inject({ method: 'GET', url: '/de' });
    expect(german.statusCode).toBe(200);
    expect(german.body).toContain('<html lang="de">');
    expect(german.body).toContain(
      '<title>Owl Be There — Findet einen Tag, an dem alle können.</title>'
    );
    expect(german.body).toContain('Ohne Anmeldung und ohne Tracking.');
    expect(german.body).toContain(
      '<link rel="canonical" href="https://owl.example.org/de" />'
    );
    const japanese = await t.app.inject({ method: 'GET', url: '/ja' });
    expect(japanese.body).toContain('<html lang="ja">');
    expect(japanese.body).toContain('みんなが集まれる日を見つけよう。');
  });

  it('names every language version of the start page, and / as the default', async () => {
    t = await testApp();
    for (const url of ['/', '/en', '/fr']) {
      const { body } = await t.app.inject({ method: 'GET', url });
      for (const language of ['de', 'en', 'es', 'fr', 'it', 'ja', 'nl', 'pt'])
        expect(body, url).toContain(
          `<link rel="alternate" hreflang="${language}" href="https://owl.example.org/${language}" />`
        );
      expect(body, url).toContain(
        '<link rel="alternate" hreflang="x-default" href="https://owl.example.org/" />'
      );
    }
    const home = await t.app.inject({ method: 'GET', url: '/' });
    expect(home.body).toContain('<html lang="en">');
    expect(home.body).toContain(
      '<link rel="canonical" href="https://owl.example.org/" />'
    );
    // Only the start page has language versions.
    const privacy = await t.app.inject({ method: 'GET', url: '/privacy' });
    expect(privacy.body).not.toContain('hreflang');
  });

  it('writes the start page text into the HTML of every language version, for readers without scripts', async () => {
    t = await testApp();
    for (const [url, language] of [
      ['/', 'en'],
      ...LANGUAGES.map((language) => [`/${language}`, language] as const),
    ] as const) {
      const { body } = await t.app.inject({ method: 'GET', url });
      const texts = HOME_TEXTS[language];
      const root = body.slice(
        body.indexOf('<div id="root">'),
        body.indexOf('</body>')
      );
      expect(root, url).toContain('<div data-static>');
      expect(root, url).toContain(
        `<h1>${escapeMarkup(SERVER_TEXTS[language].tagline)}</h1>`
      );
      expect(root, url).toContain(`<p>${escapeMarkup(texts['home.lead'])}</p>`);
      for (const topic of FAQ_TOPICS) {
        expect(root, `${url} ${topic}`).toContain(
          `<h3>${escapeMarkup(texts[`home.faq.${topic}.q`])}</h3>`
        );
        expect(root, `${url} ${topic}`).toContain(
          `<p>${escapeMarkup(texts[`home.faq.${topic}.a`])}</p>`
        );
      }
      expect(body, url).not.toContain('<!--owl:root-->');
    }
  });

  it('describes the start page to search engines as a free web app with its questions, in its language', async () => {
    t = await testApp();
    for (const [url, language] of [
      ['/', 'en'],
      ['/de', 'de'],
      ['/ja/', 'ja'],
    ] as const) {
      const { body } = await t.app.inject({ method: 'GET', url });
      const scripts = [
        ...body.matchAll(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
        ),
      ];
      expect(scripts, url).toHaveLength(1);
      const graph = JSON.parse(scripts[0]![1]!)['@graph'];
      expect(graph[0], url).toMatchObject({
        '@type': 'WebApplication',
        name: 'Owl Be There',
        url: `https://owl.example.org${url === '/ja/' ? '/ja' : url}`,
        inLanguage: language,
        isAccessibleForFree: true,
        description: SERVER_TEXTS[language].description,
      });
      expect(graph[1]['@type'], url).toBe('FAQPage');
      expect(graph[1].mainEntity, url).toEqual(
        FAQ_TOPICS.map((topic) => ({
          '@type': 'Question',
          name: HOME_TEXTS[language][`home.faq.${topic}.q`],
          acceptedAnswer: {
            '@type': 'Answer',
            text: HOME_TEXTS[language][`home.faq.${topic}.a`],
          },
        }))
      );
    }
  });

  it('keeps the start page text and the structured data off every other page', async () => {
    t = await testApp({ env: IMPRINT_ENV });
    const { id } = await createEvent(t.app, { title: 'Quiet page' });
    for (const url of [`/e/${id}`, '/privacy', '/imprint', '/nowhere']) {
      const { body } = await t.app.inject({ method: 'GET', url });
      expect(body, url).toContain('<div id="root"></div>');
      expect(body, url).not.toContain('data-static');
      expect(body, url).not.toContain('application/ld+json');
      expect(body, url).not.toContain('<!--owl:root-->');
    }
  });

  it('serves event pages in the language of the event', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app, { language: 'nl' });
    const { body } = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(body).toContain('<html lang="nl">');
    expect(body).not.toContain('hreflang');
    expect(body).not.toContain('rel="canonical"');
  });

  it('answers a language it does not speak, or a capitalised one, with a 404', async () => {
    t = await testApp();
    for (const url of ['/xx', '/no', '/DE', '/de/privacy']) {
      const response = await t.app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(404);
      expect(response.body, url).toContain('<html lang="en">');
    }
  });

  it('points robots at the sitemap under the public address', async () => {
    t = await testApp();
    const robots = await t.app.inject({ method: 'GET', url: '/robots.txt' });
    expect(robots.statusCode).toBe(200);
    expect(robots.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(robots.headers['cache-control']).toBe('no-cache');
    expect(robots.body).toContain('Disallow: /api/');
    expect(robots.body).toContain(
      'Sitemap: https://owl.example.org/sitemap.xml'
    );
  });

  it('lists the start page in every language and the privacy page, never an event', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    const response = await t.app.inject({ method: 'GET', url: '/sitemap.xml' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe(
      'application/xml; charset=utf-8'
    );
    const locs = [...response.body.matchAll(/<loc>([^<]*)<\/loc>/g)].map(
      (match) => match[1]
    );
    expect(locs).toEqual([
      'https://owl.example.org/',
      ...['de', 'en', 'es', 'fr', 'it', 'ja', 'nl', 'pt'].map(
        (language) => `https://owl.example.org/${language}`
      ),
      'https://owl.example.org/privacy',
    ]);
    expect(response.body).not.toContain('/imprint');
    expect(response.body).not.toContain(id);
    expect(response.body).not.toContain('/e/');
    // Each start page names all nine versions.
    expect(response.body.match(/hreflang=/g)).toHaveLength(9 * 9);
  });

  it('lists /imprint in the sitemap, after the privacy page, when it is configured', async () => {
    t = await testApp({ env: IMPRINT_ENV });
    const response = await t.app.inject({ method: 'GET', url: '/sitemap.xml' });
    const locs = [...response.body.matchAll(/<loc>([^<]*)<\/loc>/g)].map(
      (match) => match[1]
    );
    expect(locs.slice(-2)).toEqual([
      'https://owl.example.org/privacy',
      'https://owl.example.org/imprint',
    ]);
  });

  it('answers an unknown event or path with the app and a 404', async () => {
    t = await testApp();
    for (const url of ['/e/AAAAAAAAAAAA', '/e/nope', '/somewhere']) {
      const response = await t.app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(404);
      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    }
  });

  it('answers an unknown API path with JSON', async () => {
    t = await testApp();
    const response = await t.app.inject({ method: 'GET', url: '/api/nothing' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'not_found',
      message: 'No such endpoint',
    });
  });

  it('serves static files, with hashed assets cached for good', async () => {
    t = await testApp();
    const asset = await t.app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(asset.headers['cache-control']).toBe(
      'public, max-age=31536000, immutable'
    );
  });

  it('serves the pages at their address with a trailing slash, head and all', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app, { title: 'Slash party' });
    for (const [url, bare] of [
      [`/e/${id}/`, `/e/${id}`],
      ['/de/', '/de'],
      ['/ja/', '/ja'],
      ['/privacy/', '/privacy'],
    ] as const) {
      for (const method of ['GET', 'HEAD'] as const) {
        const slash = await t!.app.inject({ method, url });
        const plain = await t!.app.inject({ method, url: bare });
        expect(slash.statusCode, `${method} ${url}`).toBe(200);
        expect(slash.headers['content-type']).toBe(
          plain.headers['content-type']
        );
        expect(slash.headers['x-robots-tag']).toBe(
          plain.headers['x-robots-tag']
        );
      }
      expect((await t.app.inject({ method: 'GET', url })).body).toBe(
        (await t.app.inject({ method: 'GET', url: bare })).body
      );
    }
    const page = await t.app.inject({ method: 'GET', url: `/e/${id}/` });
    expect(page.body).toContain('Slash party');
  });

  it('keeps unknown events and paths a 404, with or without a slash', async () => {
    t = await testApp();
    for (const url of ['/e/AAAAAAAAAAAA/', '/e/nope/', '/xx/', '/somewhere/']) {
      const response = await t.app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(404);
    }
    const { id } = await createEvent(t.app);
    // The picture has the one address only.
    const picture = await t.app.inject({
      method: 'GET',
      url: `/e/${id}/og.png/`,
    });
    expect(picture.statusCode).toBe(404);
  });

  it('answers the JSON 404 for /api and what is below it, the app for names that merely start with api', async () => {
    t = await testApp();
    for (const url of ['/api', '/api/', '/api/x', '/api?x=1', '/api/x?y=2']) {
      const response = await t.app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(404);
      expect(response.json().error, url).toBe('not_found');
    }
    for (const url of ['/apix', '/api.txt', '/apiary/x', '/API']) {
      const response = await t.app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(404);
      expect(response.headers['content-type'], url).toBe(
        'text/html; charset=utf-8'
      );
    }
  });

  it('answers the JSON 404 for every path without a client, /apix included', async () => {
    t = await testApp({ site: false });
    for (const url of ['/apix', '/api.txt', '/api', '/api/x', '/api?x=1']) {
      const response = await t.app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(404);
      expect(response.json().error, url).toBe('not_found');
    }
  });

  describe('caching static files', () => {
    const dirs: string[] = [];
    afterEach(() => {
      for (const dir of dirs.splice(0))
        rmSync(dir, { recursive: true, force: true });
    });

    /** A copy of the test client under a path of our choosing. */
    const clientAt = (...parts: string[]): string => {
      const root = mkdtempSync(joinPath(tmpdir(), 'owl-client-'));
      dirs.push(root);
      const dir = joinPath(root, ...parts);
      mkdirSync(dir, { recursive: true });
      cpSync(CLIENT_DIR, dir, { recursive: true });
      writeFileSync(joinPath(dir, 'favicon.svg'), '<svg/>');
      mkdirSync(joinPath(dir, 'assets-old'));
      writeFileSync(joinPath(dir, 'assets-old', 'old.js'), '//');
      return dir;
    };
    const IMMUTABLE = 'public, max-age=31536000, immutable';

    const cacheControl = async (clientDir: string) => {
      t = await testApp({ env: { CLIENT_DIR: clientDir } });
      const get = async (url: string) =>
        (await t!.app.inject({ method: 'GET', url })).headers['cache-control'];
      return {
        asset: await get('/assets/app.js'),
        icon: await get('/favicon.svg'),
        index: await get('/index.html'),
        old: await get('/assets-old/old.js'),
      };
    };

    it('makes only the hashed assets immutable', async () => {
      expect(await cacheControl(clientAt('dist'))).toEqual({
        asset: IMMUTABLE,
        icon: 'no-cache',
        index: 'no-cache',
        old: 'no-cache',
      });
    });

    it('does not mind a client directory with assets in its own path', async () => {
      for (const parts of [
        ['assets', 'owl', 'dist'],
        ['x', 'assets'],
        ['assets'],
      ]) {
        expect(await cacheControl(clientAt(...parts)), parts.join('/')).toEqual(
          {
            asset: IMMUTABLE,
            icon: 'no-cache',
            index: 'no-cache',
            old: 'no-cache',
          }
        );
        await t!.app.close();
        t = undefined;
      }
    });
  });

  it('runs as an API alone without a client', async () => {
    t = await testApp({ site: false });
    const response = await t.app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('not_found');
    const { id } = await createEvent(t.app);
    const picture = await t.app.inject({
      method: 'GET',
      url: `/e/${id}/og.png`,
    });
    expect(picture.statusCode).toBe(404);
  });
});

describe('preview pictures', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it('draws a PNG of the event, kept out of search engines', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    const response = await t.app.inject({
      method: 'GET',
      url: `/e/${id}/og.png`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    // The picture shows the title and the heatmap: no shared cache keeps it.
    expect(response.headers['cache-control']).toBe('private, max-age=300');
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(response.rawPayload.subarray(0, 8)).toEqual(PNG);
    // 1200 × 630, from the IHDR chunk.
    expect(response.rawPayload.readUInt32BE(16)).toBe(1200);
    expect(response.rawPayload.readUInt32BE(20)).toBe(630);
  });

  it('points the event head at the picture of this version, with its own alt text', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app, { language: 'de' });
    const head = async () =>
      (await t!.app.inject({ method: 'GET', url: `/e/${id}` })).body;
    const before = await head();
    const image = /<meta property="og:image" content="([^"]+)"/.exec(before)!;
    expect(image[1]).toMatch(
      new RegExp(`^https://owl\\.example\\.org/e/${id}/og\\.png\\?v=\\d+$`)
    );
    expect(before).toContain(
      'content="Die möglichen Tage im Kalender, gefärbt danach, wie viele können"'
    );
    const max = await join(t.app, id, 'Max');
    await mark(t.app, id, max, WEEKEND);
    const after = /<meta property="og:image" content="([^"]+)"/.exec(
      await head()
    )!;
    expect(after[1]).not.toBe(image[1]);
    // The start page keeps the owl.
    expect((await t.app.inject({ method: 'GET', url: '/' })).body).toContain(
      '<meta property="og:image" content="https://owl.example.org/og.png" />'
    );
  });

  it('draws a changed poll anew', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    const get = async () =>
      (await t!.app.inject({ method: 'GET', url: `/e/${id}/og.png` }))
        .rawPayload;
    const first = await get();
    expect((await get()).equals(first)).toBe(true);
    const max = await join(t.app, id, 'Max');
    await mark(t.app, id, max, WEEKEND);
    expect((await get()).equals(first)).toBe(false);
  });

  it('draws Japanese events, even without the Japanese font at hand', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app, {
      language: 'ja',
      title: '忘年会',
    });
    const response = await t.app.inject({
      method: 'GET',
      url: `/e/${id}/og.png`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.subarray(0, 8)).toEqual(PNG);
  });

  it('embeds the owl and the Japanese font when the client has them', async () => {
    t = await testApp();
    // The client's public folder: favicon.svg and fonts/noto-sans-cjk-jp-*.
    const client = joinPath(import.meta.dirname, '../../client/public');
    const latin = snapshot(t.db, (await createEvent(t.app)).id)!;
    const japanese = snapshot(
      t.db,
      (await createEvent(t.app, { language: 'ja', title: '忘年会' })).id
    )!;
    const bare = new PreviewRenderer(null, 'owl.example.org');
    const full = new PreviewRenderer(client, 'owl.example.org');
    for (const data of [latin, japanese]) {
      const without = await bare.render(data);
      const withAssets = await full.render(data);
      expect(withAssets.subarray(0, 8)).toEqual(PNG);
      expect(withAssets.equals(without), data.event.language).toBe(false);
    }
  });

  it('answers an unknown or malformed event with a 404', async () => {
    t = await testApp();
    for (const url of ['/e/AAAAAAAAAAAA/og.png', '/e/nope/og.png']) {
      const response = await t.app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(404);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['cache-control'], url).toBeUndefined();
    }
  });

  it('is gone with the event, from the picture and from the page', async () => {
    t = await testApp();
    const { id, adminToken } = await createEvent(t.app);
    for (const url of [`/e/${id}`, `/e/${id}/og.png`]) {
      const response = await t.app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(200);
      expect(response.headers['cache-control'], url).toMatch(/^private,/);
    }
    await t.app.inject({
      method: 'DELETE',
      url: `/api/events/${id}`,
      headers: adminHeaders(adminToken),
    });
    for (const url of [`/e/${id}`, `/e/${id}/og.png`]) {
      for (let i = 0; i < 2; i += 1) {
        const response = await t.app.inject({ method: 'GET', url });
        expect(response.statusCode, url).toBe(404);
        expect(response.headers['cache-control'] ?? '', url).not.toMatch(
          /public/
        );
      }
    }
  });

  it('count a HEAD request against the same limit as GET', async () => {
    t = await testApp({ env: { RATE_LIMIT_MULTIPLIER: '1' } });
    const { id } = await createEvent(t.app);
    const url = `/e/${id}/og.png`;
    for (let i = 0; i < 120; i += 1) {
      expect((await t.app.inject({ method: 'GET', url })).statusCode).toBe(200);
    }
    expect((await t.app.inject({ method: 'GET', url })).statusCode).toBe(429);
    expect((await t.app.inject({ method: 'HEAD', url })).statusCode).toBe(429);
    // The page has a limit of its own; this one is not used up.
    expect(
      (await t.app.inject({ method: 'HEAD', url: `/e/${id}` })).statusCode
    ).toBe(200);
  });

  it('answers HEAD for the page and the picture like GET', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    for (const url of [`/e/${id}`, `/e/${id}/og.png`]) {
      const get = await t.app.inject({ method: 'GET', url });
      const head = await t.app.inject({ method: 'HEAD', url });
      expect(head.statusCode, url).toBe(200);
      expect(head.headers['content-type'], url).toBe(
        get.headers['content-type']
      );
    }
    const unknown = await t.app.inject({
      method: 'HEAD',
      url: '/e/AAAAAAAAAAAA',
    });
    expect(unknown.statusCode).toBe(404);
  });
});

describe('page helpers', () => {
  it('escape everything that could end an attribute or a tag', () => {
    expect(escapeMarkup(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
    );
  });

  it('turn an emoji into an SVG icon', () => {
    expect(decodeURIComponent(emojiIcon('⚽'))).toContain(
      '<text y=".9em" font-size="90">⚽</text>'
    );
  });

  it('refuse an index.html without the head block', () => {
    expect(() => new PageTemplate('<html><head></head></html>')).toThrow(
      /owl:head/
    );
    expect(() => new PageTemplate('<!--/owl:head--><!--owl:head-->')).toThrow(
      /owl:head/
    );
  });

  it('refuse an index.html without a single place for the content after the head', () => {
    const head = '<head><!--owl:head--><!--/owl:head--></head>';
    expect(
      () => new PageTemplate(`<html>${head}<div id="root"></div></html>`)
    ).toThrow(/owl:root/);
    expect(
      () =>
        new PageTemplate(
          `<html>${head}<div id="root"><!--owl:root--><!--owl:root--></div></html>`
        )
    ).toThrow(/owl:root/);
    expect(
      () =>
        new PageTemplate(
          '<html><!--owl:root--><head><!--owl:head--><!--/owl:head--></head></html>'
        )
    ).toThrow(/owl:root/);
  });

  it('put the head and the content in their places, and nothing in the content by default', () => {
    const template = new PageTemplate(
      '<html lang="en"><head><!--owl:head-->old<!--/owl:head--></head><body><div id="root"><!--owl:root--></div></body></html>'
    );
    expect(template.render('<title>T</title>', 'de', '<p>$& $1</p>')).toBe(
      '<html lang="de"><head><title>T</title></head><body><div id="root"><p>$& $1</p></div></body></html>'
    );
    expect(template.render('')).toBe(
      '<html lang="en"><head></head><body><div id="root"></div></body></html>'
    );
  });

  it('escape every < in structured data, so no text can end the script', () => {
    const script = jsonLd({ text: '</script><script>alert(1)</script> <!--' });
    const inner = script.slice(
      '<script type="application/ld+json">'.length,
      -'</script>'.length
    );
    expect(inner).not.toContain('<');
    expect(JSON.parse(inner)).toEqual({
      text: '</script><script>alert(1)</script> <!--',
    });
  });
});

describe('requests', () => {
  it('accept JSON only', async () => {
    t = await testApp();
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { 'content-type': 'text/plain' },
      payload: JSON.stringify(eventBody()),
    });
    expect(response.statusCode).toBe(415);
    expect(response.json().error).toBe('unsupported_media_type');
  });

  it('refuse a body over 32 KB', async () => {
    t = await testApp();
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/events',
      payload: eventBody({ description: 'x'.repeat(40_000) }),
    });
    expect(response.statusCode).toBe(413);
    expect(response.json().error).toBe('too_large');
  });

  it('answer the instance information and the health check', async () => {
    t = await testApp({
      env: {
        OPERATOR_NAME: 'Example Org',
        OPERATOR_ADDRESS: 'Musterstraße 1\n12345 Musterstadt',
        LOG_RETENTION_DAYS: '7',
        IMPRINT_URL: 'https://example.org/imprint',
      },
    });
    const info = await t.app.inject({ method: 'GET', url: '/api/instance' });
    expect(info.json()).toMatchObject({
      creationEnabled: true,
      retentionDays: 90,
      logRetentionDays: 7,
      backupRetentionDays: null,
      operatorName: 'Example Org',
      operatorAddress: 'Musterstraße 1, 12345 Musterstadt',
      operatorContact: null,
      imprintUrl: 'https://example.org/imprint',
      publicUrl: 'https://owl.example.org',
    });
    expect(info.json().version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(
      (await t.app.inject({ method: 'GET', url: '/api/health' })).json()
    ).toEqual({ ok: true });
  });
});

describe('rate limits', () => {
  it('count each address separately and answer 429 with JSON', async () => {
    t = await testApp({ env: { RATE_LIMIT_MULTIPLIER: '1' } });
    const { id } = await createEvent(t.app);
    const sessionFrom = (remoteAddress: string, name: string) =>
      sessionRequest(t!.app, id, { name }, { remoteAddress });
    for (let i = 0; i < 10; i += 1) {
      expect((await sessionFrom('203.0.113.1', `A${i}`)).statusCode).toBe(200);
    }
    const blocked = await sessionFrom('203.0.113.1', 'A10');
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error).toBe('rate_limited');
    expect((await sessionFrom('203.0.113.2', 'B')).statusCode).toBe(200);
    // Another address of the same IPv6 /64 is the same client.
    for (let i = 0; i < 10; i += 1) {
      await sessionFrom(`2001:db8::${i + 1}`, `C${i}`);
    }
    expect((await sessionFrom('2001:db8::ff', 'C10')).statusCode).toBe(429);
  });

  it('believe the forwarded address only from a trusted proxy', async () => {
    t = await testApp({ env: { RATE_LIMIT_MULTIPLIER: '1' } });
    const { id } = await createEvent(t.app);
    const session = (
      forwardedFor: string,
      name: string,
      remoteAddress = '127.0.0.1'
    ) =>
      sessionRequest(
        t!.app,
        id,
        { name },
        { headers: { 'x-forwarded-for': forwardedFor }, remoteAddress }
      );
    for (let i = 0; i < 10; i += 1) await session('203.0.113.9', `A${i}`);
    expect((await session('203.0.113.9', 'A10')).statusCode).toBe(429);
    expect((await session('203.0.113.10', 'B')).statusCode).toBe(200);
  });

  it('cap new events per hour per address', async () => {
    t = await testApp({ env: { RATE_LIMIT_MULTIPLIER: '1' } });
    for (let i = 0; i < 10; i += 1) await createEvent(t.app);
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/events',
      payload: eventBody(),
    });
    expect(response.statusCode).toBe(429);
  });
});

describe('logs', () => {
  it('never contain an address or an event link', async () => {
    t = await testApp();
    const { id } = await createEvent(t.app);
    const max = await join(t.app, id, 'Max');
    await mark(t.app, id, max, WEEKEND);
    await t.app.inject({
      method: 'GET',
      url: `/e/${id}`,
      remoteAddress: '203.0.113.77',
    });
    await t.app.inject({
      method: 'GET',
      url: '/api/events/bad',
      remoteAddress: '203.0.113.77',
    });
    const logs = t.logs.join('\n');
    expect(logs).not.toContain('203.0.113.77');
    expect(logs).not.toContain('127.0.0.1');
    expect(logs).not.toContain(id);
  });
});
