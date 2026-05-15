import { describe, it, expect, afterEach } from 'vitest';
import { mockr, delay as delayMw, handler } from '../src/index.js';

describe('Per-endpoint delay', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => { await server?.close(); });

  it('applies a fixed ms delay on a data endpoint', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/users', data: [{ id: 1 }], delay: 60 },
      ],
    });

    const start = Date.now();
    const res = await fetch(`${server.url}/api/users`);
    const elapsed = Date.now() - start;
    expect(res.status).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(res.headers.get('x-mockr-delay')).toBe('60');
  });

  it('applies a {min,max} window — header carries actual ms within range', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/users', data: [{ id: 1 }], delay: { min: 40, max: 80 } },
      ],
    });

    const start = Date.now();
    const res = await fetch(`${server.url}/api/users`);
    const elapsed = Date.now() - start;
    expect(res.status).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(30);

    const headerVal = Number(res.headers.get('x-mockr-delay'));
    expect(headerVal).toBeGreaterThanOrEqual(40);
    expect(headerVal).toBeLessThanOrEqual(80);
  });

  it('per-route delay overrides global delay() middleware (not additive)', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/users', data: [{ id: 1 }], delay: 80 },
      ],
      middleware: [delayMw({ min: 200, max: 200 })],
    });

    const start = Date.now();
    const res = await fetch(`${server.url}/api/users`);
    const elapsed = Date.now() - start;
    // ~80ms expected; if additive (80+200=280) test would catch it
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(180);
    expect(res.headers.get('x-mockr-delay')).toBe('80');
  });

  it('delay: 0 = explicit no-delay (global middleware skipped)', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/users', data: [{ id: 1 }], delay: 0 },
      ],
      middleware: [delayMw({ min: 200, max: 200 })],
    });

    const start = Date.now();
    const res = await fetch(`${server.url}/api/users`);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(res.headers.get('x-mockr-delay')).toBe('0');
  });

  it('global delay middleware still applies when endpoint has no delay set', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/users', data: [{ id: 1 }] },
      ],
      middleware: [delayMw({ min: 60, max: 60 })],
    });

    const start = Date.now();
    const res = await fetch(`${server.url}/api/users`);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
    // Header is only emitted by route-level delay
    expect(res.headers.get('x-mockr-delay')).toBeNull();
  });

  it('disabled endpoint with delay does not delay (falls through, no header)', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/users', data: [{ id: 1 }], delay: 200 },
      ],
    });
    server.disableEndpoint('/api/users');

    const start = Date.now();
    const res = await fetch(`${server.url}/api/users`);
    const elapsed = Date.now() - start;
    expect(res.status).toBe(404);
    expect(elapsed).toBeLessThan(100);
    expect(res.headers.get('x-mockr-delay')).toBeNull();
  });

  it('applies delay on handler-type endpoint', async () => {
    server = await mockr({
      endpoints: [
        {
          url: '/api/compute',
          handler: handler({ fn: () => ({ body: { ok: true } }) }),
          delay: 60,
        },
      ],
    });

    const start = Date.now();
    const res = await fetch(`${server.url}/api/compute`);
    const elapsed = Date.now() - start;
    expect(res.status).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(res.headers.get('x-mockr-delay')).toBe('60');
  });

  it('applies delay on methods-map endpoint (every verb)', async () => {
    server = await mockr({
      endpoints: [
        {
          url: '/api/cart',
          methods: {
            GET: handler({ fn: () => ({ body: { items: [] } }) }),
            POST: handler({ fn: () => ({ body: { added: true } }) }),
          },
          delay: 60,
        },
      ],
    });

    const startGet = Date.now();
    const resGet = await fetch(`${server.url}/api/cart`);
    const elapsedGet = Date.now() - startGet;
    expect(resGet.status).toBe(200);
    expect(elapsedGet).toBeGreaterThanOrEqual(40);
    expect(resGet.headers.get('x-mockr-delay')).toBe('60');

    const startPost = Date.now();
    const resPost = await fetch(`${server.url}/api/cart`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 1 }),
    });
    const elapsedPost = Date.now() - startPost;
    expect(resPost.status).toBe(200);
    expect(elapsedPost).toBeGreaterThanOrEqual(40);
    expect(resPost.headers.get('x-mockr-delay')).toBe('60');
  });
});
