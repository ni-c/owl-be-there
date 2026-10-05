import { CreateEventBody } from '@owl/shared';
import { describe, expect, it } from 'vitest';
import {
  clientKey,
  networkKey,
  parseBody,
  ValidationError,
} from '../src/http.js';

describe('clientKey', () => {
  it('keeps an IPv4 address as it is', () => {
    expect(clientKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('reduces an IPv4-mapped IPv6 address to the IPv4 one', () => {
    expect(clientKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('puts every address of an IPv6 /64 in one bucket', () => {
    const a = clientKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    const b = clientKey('2001:db8:1:2::1');
    expect(a).toBe('2001:db8:1:2::');
    expect(b).toBe(a);
    expect(clientKey('2001:db8:1:3::1')).not.toBe(a);
    // The last bit of the /64 prefix tells two networks apart.
    expect(clientKey('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe(a);
    expect(clientKey('2001:db8:1:3::')).not.toBe(a);
    expect(clientKey('2001:db8:1:1:ffff:ffff:ffff:ffff')).not.toBe(a);
  });

  it('gives the same key to every way of writing an address', () => {
    const key = clientKey('2001:db8:1:2::1');
    expect(clientKey('2001:0DB8:0001:0002:0000:0000:0000:0001')).toBe(key);
    expect(clientKey('2001:DB8:1:2::1')).toBe(key);
  });

  it('handles the short forms of IPv6', () => {
    expect(clientKey('::1')).toBe(clientKey('::'));
    expect(clientKey('::1')).not.toBe(clientKey('1::'));
    expect(clientKey('1::')).toBe(clientKey('1:0:0:0:ffff::1'));
    expect(clientKey('fe80::1%eth0')).toBe(clientKey('fe80::2'));
    expect(clientKey('fe80::1%eth0')).not.toBe(clientKey('fe81::1'));
  });

  it('reduces every form of an IPv4-mapped address to the IPv4 one', () => {
    expect(clientKey('::ffff:cb00:7107')).toBe('203.0.113.7');
    expect(clientKey('::FFFF:203.0.113.7')).toBe('203.0.113.7');
    expect(clientKey('0:0:0:0:0:ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(clientKey('[::ffff:cb00:7107]:80')).toBe('203.0.113.7');
  });

  it('takes the address out of one that carries a port', () => {
    expect(clientKey('203.0.113.77:51234')).toBe('203.0.113.77');
    expect(clientKey('203.0.113.77:1')).toBe('203.0.113.77');
    expect(clientKey('[2001:db8::1]:443')).toBe(clientKey('2001:db8::1'));
    expect(clientKey('[2001:db8::1]')).toBe(clientKey('2001:db8::1'));
    expect(clientKey('[::ffff:203.0.113.7]:80')).toBe('203.0.113.7');
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
    ]) {
      expect(clientKey(garbage)).toBe('unknown');
    }
  });
});

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
    expect(networkKey('2001:db8:2::1')).not.toBe(a);
    expect(networkKey('2001:db8:0:ffff:ffff:ffff:ffff:ffff')).not.toBe(a);
    // The /64 is finer than the /48.
    expect(clientKey('2001:db8:1:2::1')).not.toBe(clientKey('2001:db8:1:3::1'));
    expect(networkKey('2001:db8:1:2::1')).toBe(networkKey('2001:db8:1:3::1'));
  });

  it('treats an address with a port like the address, and garbage as one key', () => {
    expect(networkKey('203.0.113.77:51234')).toBe('203.0.113.77');
    expect(networkKey('[2001:db8:1:2::1]:443')).toBe(
      networkKey('2001:db8:1:2::1')
    );
    expect(networkKey('unknown')).toBe('unknown');
    expect(networkKey('')).toBe('unknown');
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
