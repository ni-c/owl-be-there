import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { limit, systemClock } from '../src/context.js';
import { SseHub } from '../src/sse.js';

class FakeResponse extends EventEmitter {
  readonly written: string[] = [];
  ended = false;
  write(chunk: string): boolean {
    this.written.push(chunk);
    return true;
  }
  end(chunk?: string): this {
    if (chunk) this.written.push(chunk);
    this.ended = true;
    this.emit('close');
    return this;
  }
}

const response = (): FakeResponse & ServerResponse =>
  new FakeResponse() as unknown as FakeResponse & ServerResponse;

describe('SseHub', () => {
  it('sends a heartbeat comment to every stream', async () => {
    const hub = new SseHub({ perClient: 5, perEvent: 5, total: 5 }, 10);
    const stream = response();
    hub.add('e', 'k', stream, 1);
    await new Promise((resolve) => setTimeout(resolve, 35));
    expect(stream.written).toContain(': ping\n\n');
    hub.close();
  });

  it('closes every stream on shutdown and forgets them', () => {
    const hub = new SseHub();
    const a = response();
    const b = response();
    hub.add('e1', 'k', a, 1);
    hub.add('e2', 'k', b, 1);
    expect(hub.size).toBe(2);
    hub.close();
    expect(a.ended && b.ended).toBe(true);
    expect(hub.size).toBe(0);
  });

  it('ignores news about events nobody watches', () => {
    const hub = new SseHub();
    expect(() => {
      hub.changed('nobody', 2);
      hub.deleted('nobody');
    }).not.toThrow();
    hub.close();
  });

  it('counts each client across events and frees its slots on close', () => {
    const hub = new SseHub({ perClient: 2, perEvent: 10, total: 10 });
    const first = response();
    hub.add('e1', 'k', first, 1);
    hub.add('e2', 'k', response(), 1);
    expect(hub.hasRoom('e3', 'k')).toBe(false);
    expect(hub.hasRoom('e3', 'other')).toBe(true);
    first.emit('close');
    // A second close event for the same stream changes nothing.
    first.emit('close');
    expect(hub.hasRoom('e3', 'k')).toBe(true);
    expect(hub.size).toBe(1);
    hub.close();
  });
});

describe('SseHub, when a stream goes away', () => {
  /** A response that, like Node's, must not be written to once ended. */
  class StrictResponse extends FakeResponse {
    late = 0;
    destroyed = false;
    get writableEnded(): boolean {
      return this.ended;
    }
    override write(chunk: string): boolean {
      if (this.ended) this.late += 1;
      return super.write(chunk);
    }
    // Ends without the immediate 'close' — as on a real socket, it follows later.
    override end(chunk?: string): this {
      if (chunk) this.written.push(chunk);
      this.ended = true;
      return this;
    }
  }
  const strict = (): StrictResponse & ServerResponse =>
    new StrictResponse() as unknown as StrictResponse & ServerResponse;

  it('stops writing to a stream it hung up on before its close arrives', () => {
    const hub = new SseHub();
    const stream = strict();
    hub.add('e', 'k', stream, 1);
    hub.deleted('e');
    expect(stream.written.at(-1)).toBe('event: deleted\ndata: {}\n\n');
    hub.changed('e', 2);
    expect(stream.late).toBe(0);
    expect(hub.size).toBe(0);
    expect(hub.hasRoom('e', 'k')).toBe(true);
    hub.close();
  });

  it('frees the slot of a stream whose socket errors', () => {
    const hub = new SseHub();
    const stream = strict();
    hub.add('e', 'k', stream, 1);
    expect(() => stream.emit('error', new Error('EPIPE'))).not.toThrow();
    expect(hub.size).toBe(0);
    hub.close();
  });

  it('does not count a client that left before its stream started', () => {
    const hub = new SseHub();
    const stream = strict();
    stream.destroyed = true;
    hub.add('e', 'k', stream, 1);
    expect(hub.size).toBe(0);
    expect(stream.written).toEqual([]);
    hub.close();
  });

  it('ends a stream after its lifetime, so the client reconnects', async () => {
    const hub = new SseHub(undefined, 60_000, 20);
    const stream = strict();
    hub.add('e', 'k', stream, 1);
    expect(hub.size).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stream.ended).toBe(true);
    expect(hub.size).toBe(0);
    hub.close();
  });

  it('hangs up on everyone at shutdown without writing twice', () => {
    const hub = new SseHub();
    const a = strict();
    hub.add('e1', 'k', a, 1);
    hub.deleted('e1');
    hub.close();
    expect(a.late).toBe(0);
    expect(hub.size).toBe(0);
  });
});

describe('context', () => {
  it('reads the system clock', () => {
    const before = Date.now();
    expect(systemClock.now()).toBeGreaterThanOrEqual(before);
  });

  it('scales rate limits by the multiplier', () => {
    expect(
      limit(loadConfig({ RATE_LIMIT_MULTIPLIER: '3' }), 10, '1 hour')
    ).toEqual({
      rateLimit: { max: 30, timeWindow: '1 hour' },
    });
  });
});
