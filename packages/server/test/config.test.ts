import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const problemsOf = (env: Record<string, string>): string[] => {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  return [];
};

describe('loadConfig', () => {
  it('runs with nothing configured', () => {
    const config = loadConfig({});
    expect(config.port).toBe(8080);
    expect(config.host).toBe('127.0.0.1');
    expect(config.publicUrl).toBe('http://localhost:8080');
    expect(config.clientDir).toBeNull();
    expect(config.trustProxy).toEqual(['127.0.0.1', '::1']);
    expect(config.creationEnabled).toBe(true);
    expect(config.rateLimitMultiplier).toBe(1);
    expect(config.logRetentionDays).toBeNull();
    expect(config.maxDbBytes).toBeNull();
  });

  it('treats blank values as unset', () => {
    expect(loadConfig({ PORT: '  ', PUBLIC_URL: '' }).port).toBe(8080);
  });

  it('derives the default public URL from the port', () => {
    expect(loadConfig({ PORT: '4173' }).publicUrl).toBe(
      'http://localhost:4173'
    );
  });

  it('reduces the public URL to its origin', () => {
    expect(
      loadConfig({ PUBLIC_URL: 'https://owl.example.org/' }).publicUrl
    ).toBe('https://owl.example.org');
  });

  it('refuses a public URL with a path, query, fragment or odd scheme', () => {
    for (const value of [
      'https://example.org/owl',
      'https://example.org/?a=1',
      'https://example.org/#x',
      'ftp://example.org',
      'not a url',
    ]) {
      expect(problemsOf({ PUBLIC_URL: value }), value).toHaveLength(1);
    }
  });

  it('collects every problem at once', () => {
    const problems = problemsOf({
      PORT: '70000',
      LOG_LEVEL: 'loud',
      CREATION_ENABLED: 'maybe',
      OWL_SECRET: 'short',
      IMPRINT_URL: 'javascript:alert(1)',
      MAX_EVENTS: '0',
    });
    expect(problems).toHaveLength(6);
  });

  it('reads booleans in the usual spellings', () => {
    expect(loadConfig({ CREATION_ENABLED: 'off' }).creationEnabled).toBe(false);
    expect(loadConfig({ CREATION_ENABLED: 'YES' }).creationEnabled).toBe(true);
  });

  it('parses the trusted proxies', () => {
    expect(loadConfig({ TRUST_PROXY: 'none' }).trustProxy).toBe(false);
    expect(loadConfig({ TRUST_PROXY: ' , ' }).trustProxy).toBe(false);
    expect(
      loadConfig({ TRUST_PROXY: '127.0.0.1, 203.0.113.0/24' }).trustProxy
    ).toEqual(['127.0.0.1', '203.0.113.0/24']);
  });

  it('keeps an absolute client directory and resolves a relative one', () => {
    expect(loadConfig({ CLIENT_DIR: '/srv/client' }).clientDir).toBe(
      '/srv/client'
    );
    expect(loadConfig({ CLIENT_DIR: 'dist' }).clientDir).toMatch(/\/dist$/);
  });

  it('accepts optional retention figures, including zero', () => {
    const config = loadConfig({
      LOG_RETENTION_DAYS: '7',
      BACKUP_RETENTION_DAYS: '0',
    });
    expect(config.logRetentionDays).toBe(7);
    expect(config.backupRetentionDays).toBe(0);
    expect(problemsOf({ LOG_RETENTION_DAYS: '-1' })).toHaveLength(1);
  });

  it('takes a ceiling on the database size, and refuses a nonsensical one', () => {
    expect(loadConfig({ MAX_DB_BYTES: '1073741824' }).maxDbBytes).toBe(
      1_073_741_824
    );
    expect(loadConfig({ MAX_DB_BYTES: '1' }).maxDbBytes).toBe(1);
    expect(loadConfig({ MAX_DB_BYTES: ' ' }).maxDbBytes).toBeNull();
    for (const bad of ['0', '-5', '1.5', '10GB', String(2 ** 51)]) {
      expect(problemsOf({ MAX_DB_BYTES: bad }), bad).toHaveLength(1);
    }
  });

  it('accepts addresses, subnets and the named ranges as trusted proxies', () => {
    expect(
      loadConfig({ TRUST_PROXY: '10.0.0.0/8, ::1, fd00::/8, loopback' })
        .trustProxy
    ).toEqual(['10.0.0.0/8', '::1', 'fd00::/8', 'loopback']);
  });

  it('refuses a trusted proxy that is not an address', () => {
    for (const value of [
      'true',
      '10.0.0.0/33',
      '::1/129',
      '10.0.0.1/8/8',
      // proxy-addr refuses a prefix length of zero, however it is written.
      '10.0.0.0/0',
      '0.0.0.0/0',
      '::/0',
      '10.0.0.0/00',
      '10.0.0.0/000',
    ]) {
      expect(problemsOf({ TRUST_PROXY: value }).join(), value).toMatch(
        /TRUST_PROXY/
      );
    }
  });

  it('accepts the smallest and the largest prefix length', () => {
    expect(
      loadConfig({ TRUST_PROXY: '10.0.0.0/1, ::/1, 10.0.0.1/32, ::1/128' })
        .trustProxy
    ).toEqual(['10.0.0.0/1', '::/1', '10.0.0.1/32', '::1/128']);
  });
});
