import { CreateEventBody } from '@owl/shared';
import { describe, expect, it } from 'vitest';
import {
  matchesEtag,
  networkKey,
  parseBody,
  ValidationError,
} from '../src/http.js';

describe('networkKey', () => {
  it('keeps IPv4 addresses, mapped or not, as they are', () => {
    expect(networkKey('203.0.113.7')).toBe('203.0.113.7');
    expect(networkKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('puts every /64 of an IPv6 /48 in one bucket', () => {
    const a = networkKey('2001:db8:1:2::1');
    expect(a).toBe('2001:db8:1::');
    expect(networkKey('2001:db8:1:ffff:1:2:3:4')).toBe(a);
    expect(networkKey('2001:db8:1:0:0:0:0:0')).toBe(a);
    expect(networkKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe(a);
    // The last bit of the /48 prefix tells two networks apart.
    expect(networkKey('2001:db8:1:ffff:ffff:ffff:ffff:ffff')).toBe(a);
    expect(networkKey('2001:db8:2::')).not.toBe(a);
    expect(networkKey('2001:db8:2::1')).not.toBe(a);
    expect(networkKey('2001:db8:0:ffff:ffff:ffff:ffff:ffff')).not.toBe(a);
    // The /64 is finer than the /48.
    expect(networkKey('2001:db8:1:2::1')).toBe(networkKey('2001:db8:1:3::1'));
  });

  it('gives the same key to every way of writing an address', () => {
    const key = networkKey('2001:db8:1:2::1');
    expect(networkKey('2001:0DB8:0001:0002:0000:0000:0000:0001')).toBe(key);
    expect(networkKey('2001:DB8:1:2::1')).toBe(key);
    expect(networkKey('2001:db8:1::')).toBe(key);
  });

  it('handles the short forms of IPv6', () => {
    expect(networkKey('::1')).toBe(networkKey('::'));
    expect(networkKey('::1')).not.toBe(networkKey('1::'));
    expect(networkKey('1::')).toBe(networkKey('1:0:0:0:ffff::1'));
    expect(networkKey('1::')).toBe(networkKey('1:0:0:ffff::1'));
    expect(networkKey('1::')).not.toBe(networkKey('1:0:1::1'));
    expect(networkKey('fe80::1%eth0')).toBe(networkKey('fe80::2'));
    expect(networkKey('fe80::1%eth0')).not.toBe(networkKey('fe81::1'));
    expect(networkKey('fe80::1%eth0')).not.toBe(networkKey('fe80:0:1::1'));
  });

  it('reduces every form of an IPv4-mapped address to the IPv4 one', () => {
    expect(networkKey('::ffff:cb00:7107')).toBe('203.0.113.7');
    expect(networkKey('::FFFF:203.0.113.7')).toBe('203.0.113.7');
    expect(networkKey('0:0:0:0:0:ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(networkKey('[::ffff:cb00:7107]:80')).toBe('203.0.113.7');
  });

  it('takes the address out of one that carries a port', () => {
    expect(networkKey('203.0.113.77:51234')).toBe('203.0.113.77');
    expect(networkKey('203.0.113.77:1')).toBe('203.0.113.77');
    expect(networkKey('[2001:db8:1:2::1]:443')).toBe(
      networkKey('2001:db8:1:2::1')
    );
    expect(networkKey('[2001:db8::1]')).toBe(networkKey('2001:db8::1'));
    expect(networkKey('[::ffff:203.0.113.7]:80')).toBe('203.0.113.7');
  });

  it('puts everything that is no address into one shared bucket', () => {
    for (const garbage of [
      'unknown',
      '',
      'garbage',
      '203.0.113.77:',
      '203.0.113.77:123456',
      '203.0.113.256',
      '[nonsense]:80',
      '[2001:db8::1',
      '::1%a%b',
      '::1%',
      '::1%a\n',
    ]) {
      expect(networkKey(garbage)).toBe('unknown');
    }
  });

  it('answers a very long or hostile string quickly', () => {
    const hostile = [
      'a'.repeat(100_000),
      '1.'.repeat(50_000),
      '['.repeat(100_000),
      '::1' + '%'.repeat(100_000),
      '::1%' + '%'.repeat(100_000),
      '%'.repeat(100_000),
      '[' + '%'.repeat(100_000) + ']:80',
      '1.1.1.' + '1'.repeat(100_000) + ':80',
    ];
    const started = performance.now();
    for (const input of hostile) expect(networkKey(input)).toBe('unknown');
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('keeps a long but valid zone id on its address', () => {
    const zoned = 'fe80::1%' + 'a'.repeat(10_000);
    expect(networkKey(zoned)).toBe(networkKey('fe80::2'));
  });
});

describe('parseBody', () => {
  it('returns the parsed body', () => {
    const body = parseBody(CreateEventBody, {
      title: 'x',
      emoji: 'owl',
      language: 'en',
      durationDays: 1,
      days: ['2027-03-06'],
    });
    expect(body.title).toBe('x');
  });

  it('names the zod code and the shared reason of each issue', () => {
    try {
      parseBody(CreateEventBody, { title: '\u3164', days: [] });
      expect.unreachable();
    } catch (error) {
      const issues = (error as ValidationError).issues;
      expect(issues.find((i) => i.path === 'title')).toMatchObject({
        code: 'custom',
        reason: 'invisible',
      });
      const days = issues.find((i) => i.path === 'days');
      expect(days?.code).toBe('too_small');
      expect(days).not.toHaveProperty('reason');
    }
  });

  it('names every problem', () => {
    try {
      parseBody(CreateEventBody, { title: '' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const paths = (error as ValidationError).issues.map(
        (issue) => issue.path
      );
      expect(paths).toEqual(
        expect.arrayContaining([
          'title',
          'emoji',
          'language',
          'durationDays',
          'days',
        ])
      );
    }
  });

  it('treats a missing body as an empty one', () => {
    expect(() => parseBody(CreateEventBody, undefined)).toThrow(
      ValidationError
    );
  });
});

describe('matchesEtag', () => {
  it.each([
    ['"v1"', true],
    ['W/"v1"', true],
    ['*', true],
    [' "v0" , W/"v1" ', true],
    ['"v0"', false],
    ['', false],
    [',', false],
    ['"v1"x', false],
    ['w/"v1"', false],
  ])('%j -> %s', (value, expected) => {
    expect(matchesEtag(value, '"v1"')).toBe(expected);
  });

  it('is false without a header and matches a weak own tag too', () => {
    expect(matchesEtag(undefined, '"v1"')).toBe(false);
    expect(matchesEtag('"v1"', 'W/"v1"')).toBe(true);
  });
});
