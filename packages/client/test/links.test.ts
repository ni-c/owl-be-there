import { describe, expect, it } from 'vitest';
import { eventLink } from '../src/lib/links.ts';

describe('eventLink', () => {
  it('uses the canonical origin, not the one the page came from', () => {
    expect(
      eventLink(
        'https://owl.example.org',
        '7gT4kPq2Wx9Z',
        'https://old.example.org'
      )
    ).toBe('https://owl.example.org/e/7gT4kPq2Wx9Z');
  });

  it('falls back to the current origin until the instance has answered', () => {
    expect(eventLink(null, '7gT4kPq2Wx9Z', 'http://127.0.0.1:8080')).toBe(
      'http://127.0.0.1:8080/e/7gT4kPq2Wx9Z'
    );
  });

  it('never doubles a slash or keeps a path of the origin', () => {
    expect(eventLink('https://owl.example.org/', 'abc', 'x:')).toBe(
      'https://owl.example.org/e/abc'
    );
    expect(eventLink('https://owl.example.org/app/', 'abc', 'x:')).toBe(
      'https://owl.example.org/e/abc'
    );
  });
});
