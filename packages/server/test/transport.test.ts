import { connect } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { migrate } from '../src/db/migrations.js';
import { Db } from '../src/db/sqlite.js';
import { createEvent, testApp, type TestApp } from './helpers.js';

let t: TestApp | undefined;
afterEach(async () => {
  await t?.app.close();
  t = undefined;
});

describe('rate limits by network', () => {
  const read = (id: string, remoteAddress: string) =>
    t!.app.inject({ method: 'GET', url: `/api/events/${id}`, remoteAddress });

  it('count every /64 of one IPv6 /48 together', async () => {
    t = await testApp({ env: { RATE_LIMIT_MULTIPLIER: '1' } });
    const { id } = await createEvent(t.app);
    for (let i = 0; i < 600; i += 1) {
      expect((await read(id, '2001:db8:1:1::1')).statusCode).toBe(200);
    }
    expect((await read(id, '2001:db8:1:1::1')).statusCode).toBe(429);
    // Another /64 of the same /48, the first and the last one.
    expect((await read(id, '2001:db8:1:2::1')).statusCode).toBe(429);
    expect((await read(id, '2001:db8:1:ffff::1')).statusCode).toBe(429);
    expect((await read(id, '2001:db8:1::5')).statusCode).toBe(429);
    // The next /48, an IPv4 address and an IPv4-mapped one are others.
    expect((await read(id, '2001:db8:2::1')).statusCode).toBe(200);
    expect((await read(id, '203.0.113.7')).statusCode).toBe(200);
    expect((await read(id, '::ffff:203.0.113.8')).statusCode).toBe(200);
  });

  it('keep an IPv4-mapped address apart from its neighbours', async () => {
    t = await testApp({ env: { RATE_LIMIT_MULTIPLIER: '1' } });
    const { id } = await createEvent(t.app);
    const session = (name: string, remoteAddress: string) =>
      t!.app.inject({
        method: 'POST',
        url: `/api/events/${id}/session`,
        payload: { name },
        remoteAddress,
      });
    for (let i = 0; i < 10; i += 1) {
      expect((await session(`A${i}`, '::ffff:203.0.113.1')).statusCode).toBe(
        200
      );
    }
    // The same address, plain or mapped, is one client.
    expect((await session('A10', '203.0.113.1')).statusCode).toBe(429);
    expect((await session('B', '203.0.113.2')).statusCode).toBe(200);
  });

  it('count participant creation per /48', async () => {
    t = await testApp({ env: { RATE_LIMIT_MULTIPLIER: '1' } });
    const { id } = await createEvent(t.app);
    const session = (name: string, remoteAddress: string) =>
      t!.app.inject({
        method: 'POST',
        url: `/api/events/${id}/session`,
        payload: { name },
        remoteAddress,
      });
    for (let i = 0; i < 10; i += 1) {
      expect((await session(`A${i}`, `2001:db8:3:${i}::1`)).statusCode).toBe(
        200
      );
    }
    expect((await session('A10', '2001:db8:3:ffff::1')).statusCode).toBe(429);
    expect((await session('B', '2001:db8:4::1')).statusCode).toBe(200);
  });
});

/** An app listening on a free port of its own, and what it was built from. */
async function listening(options: {
  logLevel?: string;
  requestTimeoutMs?: number;
  logs?: string[];
}) {
  const config = loadConfig({
    PUBLIC_URL: 'https://owl.example.org',
    LOG_LEVEL: options.logLevel ?? 'silent',
    RATE_LIMIT_MULTIPLIER: '1000',
  });
  const db = new Db(':memory:');
  migrate(db);
  const app = await buildApp({
    config,
    db,
    secret: Buffer.alloc(32, 7),
    heartbeatMs: 60_000,
    ...(options.requestTimeoutMs !== undefined && {
      requestTimeoutMs: options.requestTimeoutMs,
    }),
    ...(options.logs && {
      logStream: { write: (line: string) => void options.logs!.push(line) },
    }),
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const port = (app.server.address() as { port: number }).port;
  return { app, port };
}

/**
 * Talk to the server over a raw socket: `send` writes what it likes, and the
 * promise resolves with everything received once the server has hung up.
 */
function exchange(
  port: number,
  send: (write: (data: string) => void) => Promise<void> | void
): Promise<{ reply: string; closedAfterMs: number }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const socket = connect(port, '127.0.0.1');
    let reply = '';
    socket.setEncoding('latin1');
    socket.on('data', (data: string) => (reply += data));
    socket.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ECONNRESET') reject(error);
    });
    socket.on('close', () =>
      resolve({ reply, closedAfterMs: Date.now() - start })
    );
    void Promise.resolve(send((data) => socket.write(data, 'latin1'))).catch(
      reject
    );
  });
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const POST_HEAD = (length: number, extra = '') =>
  `POST /api/events HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: ${length}\r\n${extra}\r\n`;

describe('a request that stops arriving', () => {
  it('is closed by the server after the timeout, and does not hold up the shutdown', async () => {
    const { app, port } = await listening({ requestTimeoutMs: 300 });
    // A live stream is open at the same time: it is a response, not timed.
    const { id } = await createEvent(app);
    const stream = connect(port, '127.0.0.1');
    let streamClosed = false;
    stream.on('close', () => (streamClosed = true));
    let received = '';
    stream.on('data', (data) => (received += data.toString()));
    stream.write(`GET /api/events/${id}/stream HTTP/1.1\r\nHost: x\r\n\r\n`);
    await pause(100);
    expect(received).toContain('text/event-stream');
    const { reply, closedAfterMs } = await exchange(port, (write) =>
      write(POST_HEAD(400) + '{"ti')
    );
    expect(closedAfterMs).toBeGreaterThanOrEqual(250);
    expect(closedAfterMs).toBeLessThan(3000);
    expect(reply).toMatch(/^HTTP\/1\.1 408/);
    expect(streamClosed).toBe(false);
    const closing = Date.now();
    await app.close();
    stream.destroy();
    expect(Date.now() - closing).toBeLessThan(2000);
  });

  it('is served when it arrives just inside the limit', async () => {
    const { app, port } = await listening({ requestTimeoutMs: 2000 });
    try {
      const body = '{"nope":true}';
      const { reply, closedAfterMs } = await exchange(port, async (write) => {
        write(
          POST_HEAD(body.length, 'Connection: close\r\n') + body.slice(0, 4)
        );
        await pause(400);
        write(body.slice(4));
      });
      // The body is not a valid event: a 400 from the handler, not a timeout.
      expect(reply).toMatch(/^HTTP\/1\.1 400/);
      expect(reply).toContain('validation_failed');
      expect(closedAfterMs).toBeLessThan(2000);
    } finally {
      await app.close();
    }
  });
});

describe('logging a request the parser refuses', () => {
  const SECRET = 'SECRETADMINTOKEN0123456789';
  const request = (extra: string) =>
    `PUT /api/events/AAAAAAAAAAAA/participants/BBBBBBBBBBBB/marks HTTP/1.1\r\nHost: x\r\nx-admin-token: ${SECRET}\r\n${extra}\r\n`;

  it('leaves the raw bytes out of the log, even at trace', async () => {
    const logs: string[] = [];
    const { app, port } = await listening({ logLevel: 'trace', logs });
    try {
      // One header line that is not a header at all.
      const { reply } = await exchange(port, (write) =>
        write(request('this is not a header\r\n'))
      );
      expect(reply).toMatch(/^HTTP\/1\.1 400/);
      await pause(50);
      expect(logs.some((line) => line.includes('client error'))).toBe(true);
      const text = logs.join('');
      expect(text).not.toContain('rawPacket');
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain('AAAAAAAAAAAA');
      // What helps an operator stays.
      expect(text).toContain('Parse Error');
    } finally {
      await app.close();
    }
  });

  it('does so for a header overflow as well', async () => {
    const logs: string[] = [];
    const { app, port } = await listening({ logLevel: 'trace', logs });
    try {
      const { reply } = await exchange(port, (write) =>
        write(request(`x-filler: ${'a'.repeat(70_000)}\r\n`))
      );
      expect(reply).toMatch(/^HTTP\/1\.1 431/);
      await pause(50);
      const text = logs.join('');
      expect(text).toContain('HPE_HEADER_OVERFLOW');
      expect(text).not.toContain('rawPacket');
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain('AAAAAAAAAAAA');
    } finally {
      await app.close();
    }
  });

  it('still logs an error with its message, stack and own properties', async () => {
    const logs: string[] = [];
    const { app } = await listening({ logLevel: 'info', logs });
    try {
      const error = Object.assign(new Error('disk gone'), { code: 'EIO' });
      app.log.error({ err: error }, 'sweeping expired events failed');
      const line = JSON.parse(logs.at(-1)!);
      expect(line.err).toMatchObject({
        type: 'Error',
        message: 'disk gone',
        code: 'EIO',
      });
      expect(line.err.stack).toContain('disk gone');
    } finally {
      await app.close();
    }
  });
});
