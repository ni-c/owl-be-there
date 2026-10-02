import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEvent } from '../src/db/repo.js';
import {
  createEvent,
  join,
  mark,
  testApp,
  WEEKEND,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let base: string;

beforeEach(async () => {
  t = await testApp({ streamLimits: { perClient: 2, perEvent: 3, total: 4 } });
  await t.app.listen({ host: '127.0.0.1', port: 0 });
  const address = t.app.server.address();
  if (typeof address !== 'object' || address === null)
    throw new Error('no address');
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await t.app.close();
});

/** Read server-sent events until `count` have arrived or the stream ends. */
async function readEvents(
  response: Response,
  count: number
): Promise<string[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: string[] = [];
  while (events.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (!block.startsWith(':')) events.push(block);
    }
  }
  await reader.cancel().catch(() => undefined);
  return events;
}

describe('live updates', () => {
  it('say hello with the current version, then announce every change', async () => {
    const { id } = await createEvent(t.app);
    const response = await fetch(`${base}/api/events/${id}/stream`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/event-stream; charset=utf-8'
    );
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    const reading = readEvents(response, 3);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const max = await join(t.app, id, 'Max');
    await mark(t.app, id, max, WEEKEND);
    const events = await reading;
    expect(events[0]).toBe('retry: 5000\nevent: changed\ndata: {"version":1}');
    expect(events[1]).toBe('event: changed\ndata: {"version":2}');
    expect(events[2]).toBe('event: changed\ndata: {"version":3}');
  });

  it('say goodbye when the event is deleted', async () => {
    const { id, adminToken } = await createEvent(t.app);
    const response = await fetch(`${base}/api/events/${id}/stream`);
    const reading = readEvents(response, 5);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await t.app.inject({
      method: 'DELETE',
      url: `/api/events/${id}`,
      headers: { 'x-admin-token': adminToken },
    });
    const events = await reading;
    expect(events.at(-1)).toBe('event: deleted\ndata: {}');
  });

  it('say goodbye when the sweep deletes the event', async () => {
    const { id } = await createEvent(t.app);
    const response = await fetch(`${base}/api/events/${id}/stream`);
    const reading = readEvents(response, 5);
    await new Promise((resolve) => setTimeout(resolve, 50));
    t.clock.advanceDays(200);
    expect(t.app.sweep()).toBe(1);
    expect((await reading).at(-1)).toBe('event: deleted\ndata: {}');
    expect(t.app.hub.size).toBe(0);
  });

  it('refuse a stream for an unknown event', async () => {
    const response = await fetch(`${base}/api/events/AAAAAAAAAAAA/stream`);
    expect(response.status).toBe(404);
  });

  it('refuse streams beyond the limits and count closed ones out', async () => {
    const { id } = await createEvent(t.app);
    const open = [
      await fetch(`${base}/api/events/${id}/stream`),
      await fetch(`${base}/api/events/${id}/stream`),
    ];
    const third = await fetch(`${base}/api/events/${id}/stream`);
    expect(third.status).toBe(429);
    expect((await third.json()).error).toBe('too_many_streams');
    for (const response of open) await response.body!.cancel();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(t.app.hub.size).toBe(0);
    const again = await fetch(`${base}/api/events/${id}/stream`);
    expect(again.status).toBe(200);
    await again.body!.cancel();
  });
});

describe('the sweep', () => {
  it('keeps an event to its last day and deletes it the day after', async () => {
    const { id } = await createEvent(t.app);
    const expires = getEvent(t.db, id)!.expires_on;
    expect(expires).toBe('2027-05-30');
    t.clock.time = Date.UTC(2027, 4, 30, 23, 59);
    expect(t.app.sweep()).toBe(0);
    t.clock.time = Date.UTC(2027, 4, 31, 0, 1);
    expect(t.app.sweep()).toBe(1);
    expect(getEvent(t.db, id)).toBeUndefined();
  });

  it('measures from the last change', async () => {
    const { id } = await createEvent(t.app);
    t.clock.advanceDays(60);
    await join(t.app, id, 'Max');
    expect(getEvent(t.db, id)!.expires_on).toBe('2027-07-29');
    t.clock.time = Date.UTC(2027, 5, 1);
    expect(t.app.sweep()).toBe(0);
  });
});
