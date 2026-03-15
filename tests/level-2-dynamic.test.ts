import { describe, it, expect, afterEach } from 'vitest';
import { mockr } from '../src/index.js';

describe('Level 2 — Dynamic handler', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => { await server?.close(); });

  it('handler receives request info', async () => {
    server = await mockr({
      endpoints: [
        {
          url: '/api/items/:id',
          handler: (req) => {
            if (req.params.id === '999') {
              return { status: 404, body: { error: 'Not found' } };
            }
            return { body: { id: req.params.id, name: 'Item ' + req.params.id } };
          },
        },
      ],
    });

    const res1 = await fetch(`${server.url}/api/items/5`);
    expect(res1.status).toBe(200);
    expect(await res1.json()).toEqual({ id: '5', name: 'Item 5' });

    const res2 = await fetch(`${server.url}/api/items/999`);
    expect(res2.status).toBe(404);
    expect(await res2.json()).toEqual({ error: 'Not found' });
  });

  it('handler receives query params', async () => {
    server = await mockr({
      endpoints: [
        {
          url: '/api/search',
          handler: (req) => ({ body: { query: req.query.q } }),
        },
      ],
    });
    const res = await fetch(`${server.url}/api/search?q=hello`);
    expect(await res.json()).toEqual({ query: 'hello' });
  });

  it('handler receives POST body', async () => {
    server = await mockr({
      endpoints: [
        {
          url: '/api/echo',
          method: 'POST',
          handler: (req) => ({ body: { received: req.body } }),
        },
      ],
    });
    const res = await fetch(`${server.url}/api/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });
    expect(await res.json()).toEqual({ received: { hello: 'world' } });
  });

  it('handler can be async', async () => {
    server = await mockr({
      endpoints: [
        {
          url: '/api/async',
          handler: async () => {
            await new Promise((r) => setTimeout(r, 10));
            return { body: { async: true } };
          },
        },
      ],
    });
    const res = await fetch(`${server.url}/api/async`);
    expect(await res.json()).toEqual({ async: true });
  });
});
