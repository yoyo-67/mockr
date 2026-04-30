import { describe, it, expect, afterEach } from 'vitest';
import { mockr, handler } from '../src/index.js';

describe('Level 0 — Static endpoints', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => { await server?.close(); });

  it('serves a static body', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/config', data: { theme: 'dark' } },
      ],
    });
    const res = await fetch(`${server.url}/api/config`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ theme: 'dark' });
  });

  it('serves a full response with status and headers', async () => {
    server = await mockr({
      endpoints: [
        {
          url: '/api/config',
          handler: handler({
            fn: () => ({ status: 201, headers: { 'X-Custom': 'yes' }, body: { ok: true } }),
          }),
        },
      ],
    });
    const res = await fetch(`${server.url}/api/config`);
    expect(res.status).toBe(201);
    expect(res.headers.get('X-Custom')).toBe('yes');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 404 for unmatched routes', async () => {
    server = await mockr({ endpoints: [] });
    const res = await fetch(`${server.url}/nope`);
    expect(res.status).toBe(404);
  });
});
