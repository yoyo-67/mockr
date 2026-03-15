import { describe, it, expect, afterEach } from 'vitest';
import { mockr, auth } from '../src/index.js';

describe('Level 5 — Middleware', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => { await server?.close(); });

  it('auth middleware blocks unauthenticated requests', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/data', body: { secret: true } },
        { url: '/health', body: { ok: true } },
      ],
      middleware: [
        auth({ type: 'bearer', validate: (t) => t === 'secret-token', exclude: ['/health'] }),
      ],
    });

    // No auth header
    const res1 = await fetch(`${server.url}/api/data`);
    expect(res1.status).toBe(401);

    // Wrong token
    const res2 = await fetch(`${server.url}/api/data`, {
      headers: { Authorization: 'Bearer wrong' },
    });
    expect(res2.status).toBe(403);

    // Correct token
    const res3 = await fetch(`${server.url}/api/data`, {
      headers: { Authorization: 'Bearer secret-token' },
    });
    expect(res3.status).toBe(200);
    expect(await res3.json()).toEqual({ secret: true });

    // Excluded path works without auth
    const res4 = await fetch(`${server.url}/health`);
    expect(res4.status).toBe(200);
  });

  it('custom middleware can modify request', async () => {
    server = await mockr({
      endpoints: [
        {
          url: '/api/test',
          handler: (req) => ({ body: { custom: (req as any).custom } }),
        },
      ],
      middleware: [
        {
          name: 'custom',
          pre: (req) => { (req as any).custom = 'injected'; },
        },
      ],
    });

    const res = await fetch(`${server.url}/api/test`);
    expect(await res.json()).toEqual({ custom: 'injected' });
  });

  it('post middleware can modify response', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/data', body: { value: 1 } },
      ],
      middleware: [
        {
          name: 'wrapper',
          post: (_req, res) => ({
            status: res.status || 200,
            body: { wrapped: true, original: res.body },
          }),
        },
      ],
    });

    const res = await fetch(`${server.url}/api/data`);
    const json = await res.json();
    expect(json).toEqual({ wrapped: true, original: { value: 1 } });
  });

  it('middleware can short-circuit with pre', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/data', body: { value: 1 } },
      ],
      middleware: [
        {
          name: 'blocker',
          pre: () => ({ status: 503, body: { error: 'Maintenance' } }),
        },
      ],
    });

    const res = await fetch(`${server.url}/api/data`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Maintenance' });
  });
});
