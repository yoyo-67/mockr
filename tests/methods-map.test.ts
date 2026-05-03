import { describe, it, expect, afterEach } from 'vitest';
import { mockr, handler } from '../src/index.js';

describe('methods map for multi-verb URLs', () => {
  let server: Awaited<ReturnType<typeof mockr>> | null = null;
  afterEach(async () => {
    if (server) await server.close();
    server = null;
  });

  it('dispatches GET and POST from a single endpoint entry', async () => {
    server = await mockr({
      port: 0,
      endpoints: [
        {
          url: '/api/x',
          methods: {
            GET: handler({ fn: () => ({ body: { kind: 'get' } }) }),
            POST: handler({ fn: () => ({ body: { kind: 'post' } }) }),
          },
        },
      ],
    });
    const g = await fetch(`${server.url}/api/x`).then((r) => r.json());
    const p = await fetch(`${server.url}/api/x`, { method: 'POST' }).then((r) => r.json());
    expect(g).toEqual({ kind: 'get' });
    expect(p).toEqual({ kind: 'post' });
  });

  it('returns 405 with Allow header for verb not in methods map', async () => {
    server = await mockr({
      port: 0,
      endpoints: [
        { url: '/api/x', methods: { GET: handler({ fn: () => ({ body: 'ok' }) }) } },
      ],
    });
    const res = await fetch(`${server.url}/api/x`, { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toContain('GET');
  });

  it('methods overrides default CRUD POST while default GET still serves data', async () => {
    server = await mockr({
      port: 0,
      endpoints: [
        {
          url: '/api/items',
          data: [{ id: 1, name: 'a' }],
          methods: {
            POST: handler({ fn: () => ({ body: { custom: true } }) }),
          },
        },
      ],
    });
    const g = await fetch(`${server.url}/api/items`).then((r) => r.json());
    expect(g).toEqual([{ id: 1, name: 'a' }]);

    const p = await fetch(`${server.url}/api/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }).then((r) => r.json());
    expect(p).toEqual({ custom: true });
  });

  it('methods alone (no data/dataFile) registers handlers for explicit verbs', async () => {
    server = await mockr({
      port: 0,
      endpoints: [
        {
          url: '/api/ping',
          methods: {
            GET: handler({ fn: () => ({ body: 'pong' }) }),
            HEAD: handler({ fn: () => ({ status: 200, body: '' }) }),
          },
        },
      ],
    });
    const g = await fetch(`${server.url}/api/ping`).then((r) => r.text());
    expect(g).toContain('pong');
    const h = await fetch(`${server.url}/api/ping`, { method: 'HEAD' });
    expect(h.status).toBe(200);
  });
});
