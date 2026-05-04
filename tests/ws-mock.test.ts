import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { mockr, ws, handler, type WsEndpoint } from '../src/index.js';

interface Closer { close: () => Promise<void> }

const open: Closer[] = [];
afterEach(async () => {
  while (open.length) {
    const s = open.pop()!;
    try { await s.close(); } catch { /* already closed */ }
  }
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Buffered receiver. Attaches a listener immediately so messages that arrive
 * before the test awaits them aren't lost.
 */
function buffered(sock: WebSocket): { take(n: number, timeoutMs?: number): Promise<unknown[]> } {
  const queue: unknown[] = [];
  const waiters: Array<() => void> = [];
  sock.on('message', (raw) => {
    queue.push(JSON.parse(raw.toString()));
    const w = waiters.shift();
    if (w) w();
  });
  return {
    async take(n: number, timeoutMs = 2000): Promise<unknown[]> {
      const out: unknown[] = [];
      const deadline = Date.now() + timeoutMs;
      while (out.length < n) {
        if (queue.length === 0) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) throw new Error(`timeout: got ${out.length}/${n}`);
          await new Promise<void>((res, rej) => {
            const t = setTimeout(() => { const i = waiters.indexOf(res); if (i >= 0) waiters.splice(i, 1); rej(new Error(`timeout: got ${out.length}/${n}`)); }, remaining);
            waiters.push(() => { clearTimeout(t); res(); });
          });
        }
        out.push(queue.shift());
      }
      return out;
    },
  };
}

describe('ws mock', () => {
  it('onConnect fires + send reaches client', async () => {
    const server = await mockr({
      endpoints: [
        {
          url: '/ws/x',
          ws: ws({
            onConnect: ({ send }) => send({ type: 'hello' }),
          }),
        },
      ],
    });
    open.push(server);

    const sock = new WebSocket(server.url.replace('http', 'ws') + '/ws/x');
    const buf = buffered(sock);
    await new Promise<void>((res, rej) => { sock.once('open', () => res()); sock.once('error', rej); });

    const [msg] = await buf.take(1);
    expect(msg).toEqual({ type: 'hello' });
    sock.close();
  });

  it('onMessage round-trips parsed JSON', async () => {
    const server = await mockr({
      endpoints: [
        {
          url: '/ws/echo',
          ws: ws({
            onMessage: ({ data, send }) => send({ echo: data }),
          }),
        },
      ],
    });
    open.push(server);

    const sock = new WebSocket(server.url.replace('http', 'ws') + '/ws/echo');
    const buf = buffered(sock);
    await new Promise<void>((res) => sock.once('open', () => res()));
    sock.send(JSON.stringify({ hi: 'there' }));
    const [reply] = await buf.take(1);
    expect(reply).toEqual({ echo: { hi: 'there' } });
    sock.close();
  });

  it('per-connection state isolates between clients', async () => {
    const server = await mockr({
      endpoints: [
        {
          url: '/ws/counter',
          ws: ws<{ count: number }, undefined, { count: number }>({
            initialState: () => ({ count: 0 }),
            onMessage: ({ state, send }) => {
              state.count += 1;
              send({ count: state.count });
            },
          }),
        },
      ],
    });
    open.push(server);

    const a = new WebSocket(server.url.replace('http', 'ws') + '/ws/counter');
    const b = new WebSocket(server.url.replace('http', 'ws') + '/ws/counter');
    const aBuf = buffered(a); const bBuf = buffered(b);
    await Promise.all([
      new Promise<void>((res) => a.once('open', () => res())),
      new Promise<void>((res) => b.once('open', () => res())),
    ]);

    a.send('1'); a.send('1'); a.send('1');
    b.send('1');
    const [, , last] = await aBuf.take(3);
    const [bMsg] = await bBuf.take(1);
    expect(last).toEqual({ count: 3 });
    expect(bMsg).toEqual({ count: 1 });

    a.close(); b.close();
  });

  it('cross-endpoint broadcast from HTTP handler reaches WS clients', async () => {
    type Endpoints = {
      '/ws/feed': WsEndpoint<{ tick: number }, undefined>;
    };
    const server = await mockr<Endpoints>({
      endpoints: [
        {
          url: '/ws/feed',
          ws: ws({}),
        },
        {
          url: '/api/tick',
          method: 'POST',
          handler: handler({
            fn: (_req, ctx) => {
              ctx.endpoint('/ws/feed').broadcast({ tick: 7 });
              return { body: { count: ctx.endpoint('/ws/feed').count() } };
            },
          }),
        },
      ],
    });
    open.push(server);

    const sock = new WebSocket(server.url.replace('http', 'ws') + '/ws/feed');
    const buf = buffered(sock);
    await new Promise<void>((res) => sock.once('open', () => res()));
    // Give the server a tick to register the connection in its map before
    // the HTTP handler runs `count()`.
    await sleep(50);

    const httpRes = await fetch(`${server.url}/api/tick`, { method: 'POST' });
    const body = await httpRes.json() as { count: number };
    expect(body.count).toBe(1);
    const [msg] = await buf.take(1);
    expect(msg).toEqual({ tick: 7 });

    sock.close();
  });

  it('schema rejection sends __mockr_error frame, socket stays open', async () => {
    const schema = {
      safeParse: (d: unknown) =>
        typeof d === 'object' && d !== null && (d as Record<string, unknown>).type === 'ping'
          ? { success: true as const, data: d as { type: 'ping' } }
          : { success: false as const, error: { issues: ['not a ping'] } },
    };
    const server = await mockr({
      endpoints: [
        {
          url: '/ws/strict',
          ws: ws({
            message: schema,
            onMessage: ({ send }) => send({ type: 'pong' }),
          }),
        },
      ],
    });
    open.push(server);

    const sock = new WebSocket(server.url.replace('http', 'ws') + '/ws/strict');
    const buf = buffered(sock);
    await new Promise<void>((res) => sock.once('open', () => res()));

    sock.send(JSON.stringify({ type: 'wrong' }));
    const [errMsg] = await buf.take(1);
    expect((errMsg as Record<string, unknown>).type).toBe('__mockr_error');

    sock.send(JSON.stringify({ type: 'ping' }));
    const [okMsg] = await buf.take(1);
    expect(okMsg).toEqual({ type: 'pong' });

    sock.close();
  });
});
