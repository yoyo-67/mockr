import { describe, it, expect, afterEach } from 'vitest';
import { mockr, handler } from '../src/index.js';

describe('Level 1 — URL matching', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => { await server?.close(); });

  it('matches path params', async () => {
    server = await mockr({
      endpoints: [
        {
          url: '/api/items/:id',
          handler: handler({ fn: (req) => ({ body: { id: req.params.id } }) }),
        },
      ],
    });
    const res = await fetch(`${server.url}/api/items/42`);
    expect(await res.json()).toEqual({ id: '42' });
  });

  it('matches regex patterns', async () => {
    server = await mockr({
      endpoints: [
        { url: /\/api\/v[0-9]+\/.*/, handler: handler({ fn: () => ({ body: { version: 'any' } }) }) },
      ],
    });
    const res = await fetch(`${server.url}/api/v3/stuff`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 'any' });
  });

  it('matches wildcard catch-all', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/**', handler: handler({ fn: () => ({ status: 404, body: { error: 'Not mocked' } }) }) },
      ],
    });
    const res = await fetch(`${server.url}/api/anything/here`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not mocked' });
  });

  it('uses first match wins', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/items/:id', handler: handler({ fn: () => ({ body: { matched: 'specific' } }) }) },
        { url: '/api/**', handler: handler({ fn: () => ({ body: { matched: 'wildcard' } }) }) },
      ],
    });
    const res = await fetch(`${server.url}/api/items/1`);
    expect(await res.json()).toEqual({ matched: 'specific' });
  });
});
