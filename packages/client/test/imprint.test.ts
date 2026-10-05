import { describe, expect, it } from 'vitest';
import {
  IMPRINT_PATH,
  imprintLink,
  looksLikeEmail,
  mailtoHref,
} from '../src/lib/imprint.ts';
import { parseRoute } from '../src/lib/route.ts';

const FULL = {
  operatorName: 'Example Organisation',
  operatorAddress: 'Musterstraße 1, 12345 Musterstadt',
  operatorContact: 'privacy@example.org',
  imprintUrl: null,
};

describe('imprintLink', () => {
  it('points at the built-in page when the instance has what it needs', () => {
    expect(imprintLink(FULL)).toEqual({ kind: 'internal', href: IMPRINT_PATH });
  });

  it('lets IMPRINT_URL win, even when the built-in page is possible', () => {
    expect(
      imprintLink({ ...FULL, imprintUrl: 'https://example.org/i' })
    ).toEqual({ kind: 'external', href: 'https://example.org/i' });
  });

  it('takes IMPRINT_URL alone', () => {
    expect(
      imprintLink({
        operatorName: null,
        operatorAddress: null,
        operatorContact: null,
        imprintUrl: 'https://example.org/i',
      })
    ).toEqual({ kind: 'external', href: 'https://example.org/i' });
  });

  it('has no link when neither is configured, or the instance is not known yet', () => {
    expect(imprintLink(null)).toBeNull();
    expect(imprintLink({ ...FULL, operatorAddress: null })).toBeNull();
    expect(imprintLink({ ...FULL, operatorName: '' })).toBeNull();
    expect(imprintLink({ ...FULL, operatorContact: null })).toBeNull();
    expect(imprintLink({ imprintUrl: '' })).toBeNull();
  });
});

describe('looksLikeEmail', () => {
  it('accepts ordinary addresses', () => {
    for (const ok of [
      'privacy@example.org',
      'first.last+tag@sub.example.co.uk',
      'ünï@exämple.de',
      'a@b.c',
    ]) {
      expect(looksLikeEmail(ok), ok).toBe(true);
    }
  });

  it('refuses everything else, so it stays plain text', () => {
    for (const bad of [
      '',
      'privacy',
      'privacy@',
      '@example.org',
      'privacy@example',
      'privacy@example.',
      'a..b@example.org',
      '.a@example.org',
      'a b@example.org',
      'a@b@example.org',
      'a@example.org?subject=x',
      'a@example.org#x',
      'a@example.org, b@example.org',
      '<a@example.org>',
      'Contact form at https://example.org/contact',
      '+49 123 4567',
      'mailto:a@example.org',
    ]) {
      expect(looksLikeEmail(bad), bad).toBe(false);
    }
  });
});

describe('mailtoHref', () => {
  it('is a link only for an address', () => {
    expect(mailtoHref('privacy@example.org')).toBe(
      'mailto:privacy@example.org'
    );
    expect(mailtoHref('+49 123 4567')).toBeNull();
  });
});

describe('the imprint route', () => {
  it('is /imprint, with or without a slash, and the privacy page likewise', () => {
    expect(parseRoute('/imprint')).toEqual({ page: 'imprint' });
    expect(parseRoute('/imprint/')).toEqual({ page: 'imprint' });
    expect(parseRoute('/privacy/')).toEqual({ page: 'privacy' });
    for (const bad of ['/imprint//', '/imprints', '/Imprint', '/de/imprint']) {
      expect(parseRoute(bad), bad).toEqual({ page: 'not-found' });
    }
  });
});
