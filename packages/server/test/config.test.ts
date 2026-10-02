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
});
