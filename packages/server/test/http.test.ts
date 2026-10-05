import { CreateEventBody } from '@owl/shared';
import { describe, expect, it } from 'vitest';
import {
  clientKey,
  expandIPv6,
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
    expect(a).toBe('2001:0db8:0001:0002::/64');
    expect(b).toBe(a);
    expect(clientKey('2001:db8:1:3::1')).not.toBe(a);
  });

  it('handles the short forms of IPv6', () => {
    expect(clientKey('::1')).toBe('0000:0000:0000:0000::/64');
    expect(clientKey('fe80::1%eth0')).toBe('fe80:0000:0000:0000::/64');
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
    expect(a).toBe('2001:0db8:0001::/48');
    expect(networkKey('2001:db8:1:ffff:1:2:3:4')).toBe(a);
    expect(networkKey('2001:db8:2::1')).not.toBe(a);
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

describe('expandIPv6', () => {
  it('writes out all eight groups', () => {
    expect(expandIPv6('2001:db8::1')).toEqual([
      '2001',
      '0db8',
      '0000',
      '0000',
      '0000',
      '0000',
      '0000',
      '0001',
    ]);
    expect(expandIPv6('::')).toEqual(Array(8).fill('0000'));
    expect(expandIPv6('1:2:3:4:5:6:7:8')).toHaveLength(8);
    expect(expandIPv6('1::')).toEqual(['0001', ...Array(7).fill('0000')]);
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
