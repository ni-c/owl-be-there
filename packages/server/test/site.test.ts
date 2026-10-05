import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../src/app.js';
import { emojiIcon } from '@owl/shared';
import { escapeHtml, PageTemplate } from '../src/pages.js';
import {
  createEvent,
  eventBody,
  join,
  mark,
  testApp,
  WEEKEND,
  type TestApp,
} from './helpers.js';

let t: TestApp | undefined;
afterEach(async () => {
  await t?.app.close();
  t = undefined;
});

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
    await t.app.inject({
      method: 'PUT',
      url: `/api/events/${id}/status`,
      headers: { 'x-admin-token': adminToken },
      payload: { status: 'finalized', start: '2027-03-06' },
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
    await t.app.inject({
      method: 'PUT',
      url: `/api/events/${id}/status`,
      headers: { 'x-admin-token': adminToken },
      payload: { status: 'finalized', start: '2027-03-06' },
    });
    const decided = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(decided.body).toContain('Ya hay fecha: sáb, 6 de marzo de 2027');
  });

  it('previews French events in French', async () => {
    t = await testApp();
    const { id, adminToken } = await createEvent(t.app, { language: 'fr' });
    const open = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(open.body).toContain('Indique les jours où tu es libre');
    await t.app.inject({
      method: 'PUT',
      url: `/api/events/${id}/status`,
      headers: { 'x-admin-token': adminToken },
      payload: { status: 'finalized', start: '2027-03-06' },
    });
    const decided = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(decided.body).toContain('La date est fixée : sam. 6 mars 2027');
  });

  it('previews Portuguese events in Portuguese', async () => {
    t = await testApp();
    const { id, adminToken } = await createEvent(t.app, { language: 'pt' });
    const open = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(open.body).toContain('Marca os dias em que podes');
    await t.app.inject({
      method: 'PUT',
      url: `/api/events/${id}/status`,
      headers: { 'x-admin-token': adminToken },
      payload: { status: 'finalized', start: '2027-03-06' },
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
    await t.app.inject({
      method: 'PUT',
      url: `/api/events/${id}/status`,
      headers: { 'x-admin-token': adminToken },
      payload: { status: 'finalized', start: '2027-03-06' },
    });
    const decided = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(decided.body).toContain('La data è decisa: sab 6 marzo 2027');
  });

  it('previews Japanese events in Japanese', async () => {
    t = await testApp();
    const { id, adminToken } = await createEvent(t.app, { language: 'ja' });
    const open = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(open.body).toContain('行ける日を選んでね');
    await t.app.inject({
      method: 'PUT',
      url: `/api/events/${id}/status`,
      headers: { 'x-admin-token': adminToken },
      payload: { status: 'finalized', start: '2027-03-06' },
    });
    const decided = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(decided.body).toContain('日程決定：2027年3月6日(土)');
  });

  it('previews Dutch events in Dutch', async () => {
    t = await testApp();
    const { id, adminToken } = await createEvent(t.app, { language: 'nl' });
    const open = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(open.body).toContain('Vul in wanneer je kunt');
    await t.app.inject({
      method: 'PUT',
      url: `/api/events/${id}/status`,
      headers: { 'x-admin-token': adminToken },
      payload: { status: 'finalized', start: '2027-03-06' },
    });
    const decided = await t.app.inject({ method: 'GET', url: `/e/${id}` });
    expect(decided.body).toContain('De datum staat vast: za 6 maart 2027');
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
    expect(response.body).not.toContain(id);
    expect(response.body).not.toContain('/e/');
    // Each start page names all nine versions.
    expect(response.body.match(/hreflang=/g)).toHaveLength(9 * 9);
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

  it('runs as an API alone without a client', async () => {
    t = await testApp({ site: false });
    const response = await t.app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('not_found');
  });
});

describe('page helpers', () => {
  it('escape everything that could end an attribute or a tag', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
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
      t!.app.inject({
        method: 'POST',
        url: `/api/events/${id}/session`,
        payload: { name },
        remoteAddress,
      });
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
      t!.app.inject({
        method: 'POST',
        url: `/api/events/${id}/session`,
        payload: { name },
        headers: { 'x-forwarded-for': forwardedFor },
        remoteAddress,
      });
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
