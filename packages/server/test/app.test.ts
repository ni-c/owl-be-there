import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError } from '../src/config.js';
import { CLIENT_DIR, createEvent, testApp, type TestApp } from './helpers.js';

let t: TestApp | undefined;
const scratch: string[] = [];
afterEach(async () => {
  await t?.app.close();
  t = undefined;
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const tempDir = (): string => {
  const dir = mkdtempSync(joinPath(tmpdir(), 'owl-app-'));
  scratch.push(dir);
  return dir;
};

describe('the client directory', () => {
  it('refuses a directory that holds no built client', async () => {
    const empty = tempDir();
    await expect(testApp({ env: { CLIENT_DIR: empty } })).rejects.toThrow(
      ConfigError
    );
    await expect(testApp({ env: { CLIENT_DIR: empty } })).rejects.toThrow(
      /CLIENT_DIR .* index\.html/
    );
  });

  it('refuses a directory that does not exist', async () => {
    const missing = joinPath(tempDir(), 'client-typo');
    await expect(testApp({ env: { CLIENT_DIR: missing } })).rejects.toThrow(
      /CLIENT_DIR .*client-typo/
    );
  });

  it('starts the API alone when it is not set', async () => {
    t = await testApp({ site: false });
    const health = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    expect((await t.app.inject({ method: 'GET', url: '/' })).statusCode).toBe(
      404
    );
  });

  it('starts with a built client', async () => {
    t = await testApp();
    const page = await t.app.inject({ method: 'GET', url: '/' });
    expect(page.statusCode).toBe(200);
  });
});

describe('answers the framework writes itself', () => {
  const security = {
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
  };

  it.each(['/%zz', '/e/AbC%', '/api/events/%', '/api/events/%E0%A4%A'])(
    'carry the app error shape and the security headers: %s',
    async (url) => {
      t = await testApp();
      const response = await t.app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'bad_request',
        message: 'Malformed URL',
      });
      expect(response.headers).toMatchObject(security);
      expect(response.headers['content-security-policy']).toContain(
        "frame-ancestors 'none'"
      );
    }
  );

  it('do not echo the path', async () => {
    t = await testApp();
    const response = await t.app.inject({
      method: 'GET',
      url: '/e/SecretLinkAb%',
    });
    expect(response.body).not.toContain('SecretLinkAb');
  });

  it('carry them on the API-only server as well', async () => {
    t = await testApp({ site: false });
    const response = await t.app.inject({ method: 'GET', url: '/%zz' });
    expect(response.statusCode).toBe(400);
    expect(response.headers).toMatchObject(security);
  });
});

describe('the cross-origin resource policy', () => {
  it('lets other sites embed the preview pictures only', async () => {
    const client = tempDir();
    cpSync(CLIENT_DIR, client, { recursive: true });
    writeFileSync(joinPath(client, 'og.png'), 'png');
    t = await testApp({ env: { CLIENT_DIR: client } });
    const { id } = await createEvent(t.app);
    const policy = async (url: string): Promise<unknown> =>
      (await t!.app.inject({ method: 'GET', url })).headers[
        'cross-origin-resource-policy'
      ];
    expect(await policy('/og.png')).toBe('cross-origin');
    expect(await policy(`/e/${id}/og.png`)).toBe('cross-origin');
    expect(await policy(`/e/${id}/og.png?v=2`)).toBe('cross-origin');
    // An unknown event answers the picture route's error the same way.
    expect(await policy('/e/AAAAAAAAAAAA/og.png')).toBe('cross-origin');

    expect(await policy('/api/instance')).toBe('same-origin');
    expect(await policy(`/e/${id}`)).toBe('same-origin');
    expect(await policy('/')).toBe('same-origin');
    expect(await policy('/assets/app.js')).toBe('same-origin');
    // Only those paths: a look-alike stays closed.
    expect(await policy('/og.png/extra')).toBe('same-origin');
    expect(await policy(`/e/${id}/og.png.txt`)).toBe('same-origin');
    expect(await policy(`/api/events/${id}/og.png`)).toBe('same-origin');
  });
});

describe('finalising at the end of the calendar', () => {
  const finalize = (id: string, token: string, start: string, duration = 2) => {
    // A block of the event's duration cannot be asked for beyond 9999-12-31.
    t!.db.run('UPDATE events SET duration_days = ? WHERE id = ?', duration, id);
    return t!.app.inject({
      method: 'PUT',
      url: `/api/events/${id}/status`,
      headers: { 'x-admin-token': token },
      payload: { status: 'finalized', start },
    });
  };

  it('answers 400 for a block that would run past the last day, not 500', async () => {
    t = await testApp();
    const { id, adminToken } = await createEvent(t.app);
    for (const start of ['9999-12-31', '9999-12-30']) {
      const response = await finalize(id, adminToken, start, 3);
      expect(response.statusCode, start).toBe(400);
      expect(response.json().error).toBe('invalid_block');
    }
  });

  it('accepts the block that ends on the last day, and not one day later', async () => {
    t = await testApp();
    const { id, adminToken } = await createEvent(t.app);
    // The API will not take candidate days that far out; the table will.
    for (const day of ['9999-12-30', '9999-12-31']) {
      t.db.run(
        'INSERT INTO event_days (event_id, day, added_at) VALUES (?, ?, 0)',
        id,
        day
      );
    }
    const late = await finalize(id, adminToken, '9999-12-31');
    expect(late.statusCode).toBe(400);
    expect(late.json().error).toBe('invalid_block');
    const fits = await finalize(id, adminToken, '9999-12-30');
    expect(fits.statusCode).toBe(200);
  });
});
