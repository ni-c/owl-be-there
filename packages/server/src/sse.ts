import type { ServerResponse } from 'node:http';

/** How many streams one client, one event and the whole process may hold. */
export interface StreamLimits {
  perClient: number;
  perEvent: number;
  total: number;
}

export const DEFAULT_STREAM_LIMITS: StreamLimits = {
  perClient: 20,
  perEvent: 200,
  total: 2000,
};

interface Stream {
  response: ServerResponse;
  clientKey: string;
}

/**
 * Live updates over server-sent events, inside one process.
 *
 * A stream only ever carries "the event changed, now at version n" or "the
 * event is gone" — never the data itself. The client fetches the snapshot like
 * it always does, through the same code path and the same validation, so a
 * missed or duplicated message costs a request rather than correctness.
 */
export class SseHub {
  private readonly streams = new Map<string, Set<Stream>>();
  private readonly perClient = new Map<string, number>();
  private count = 0;
  private readonly heartbeat: NodeJS.Timeout;
  private readonly limits: StreamLimits;

  constructor(
    limits: StreamLimits = DEFAULT_STREAM_LIMITS,
    heartbeatMs = 25_000
  ) {
    this.limits = limits;
    // A comment line now and then keeps proxies and phone networks from
    // closing a connection that looks idle.
    this.heartbeat = setInterval(
      () => this.broadcast(': ping\n\n'),
      heartbeatMs
    );
    this.heartbeat.unref();
  }

  /** Whether one more stream for this client and event would fit. */
  hasRoom(eventId: string, clientKey: string): boolean {
    return (
      this.count < this.limits.total &&
      (this.streams.get(eventId)?.size ?? 0) < this.limits.perEvent &&
      (this.perClient.get(clientKey) ?? 0) < this.limits.perClient
    );
  }

  /** Start streaming to a response whose headers have been sent. */
  add(
    eventId: string,
    clientKey: string,
    response: ServerResponse,
    version: number
  ): void {
    const stream: Stream = { response, clientKey };
    let set = this.streams.get(eventId);
    if (!set) {
      set = new Set();
      this.streams.set(eventId, set);
    }
    set.add(stream);
    this.count += 1;
    this.perClient.set(clientKey, (this.perClient.get(clientKey) ?? 0) + 1);
    response.on('close', () => this.remove(eventId, stream));
    // Reconnect after five seconds when the connection drops, and say where
    // the event is now, so a client that reconnects can tell whether it missed
    // anything.
    response.write(
      `retry: 5000\nevent: changed\ndata: ${JSON.stringify({ version })}\n\n`
    );
  }

  private remove(eventId: string, stream: Stream): void {
    const set = this.streams.get(eventId);
    if (!set?.delete(stream)) return;
    if (set.size === 0) this.streams.delete(eventId);
    this.count -= 1;
    const remaining = (this.perClient.get(stream.clientKey) ?? 1) - 1;
    if (remaining > 0) this.perClient.set(stream.clientKey, remaining);
    else this.perClient.delete(stream.clientKey);
  }

  changed(eventId: string, version: number): void {
    this.send(
      eventId,
      `event: changed\ndata: ${JSON.stringify({ version })}\n\n`
    );
  }

  /** Tell everyone watching that the event is gone, and hang up. */
  deleted(eventId: string): void {
    const set = this.streams.get(eventId);
    if (!set) return;
    for (const stream of [...set]) {
      stream.response.end('event: deleted\ndata: {}\n\n');
    }
  }

  get size(): number {
    return this.count;
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const set of this.streams.values()) {
      for (const stream of [...set]) stream.response.end();
    }
  }

  private send(eventId: string, message: string): void {
    for (const stream of this.streams.get(eventId) ?? [])
      stream.response.write(message);
  }

  private broadcast(message: string): void {
    for (const set of this.streams.values()) {
      for (const stream of set) stream.response.write(message);
    }
  }
}
