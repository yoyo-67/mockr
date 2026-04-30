import { describe, it, expect, afterEach } from 'vitest';
import { mockr } from '../src/index.js';
import { writeFile, mkdir } from 'node:fs/promises';

describe('Level 4 — Cross-endpoint', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => { await server?.close(); });

  it('handler reads another endpoint data', async () => {
    server = await mockr({
      endpoints: [
        {
          url: '/api/items',
          data: [
            { id: 1, name: 'Apple', price: 1 },
            { id: 2, name: 'Banana', price: 2 },
          ],
        },
        {
          url: '/api/summary',
          handler: (_req, { endpoint }) => {
            const items = endpoint('/api/items');
            return {
              body: {
                count: items.count(),
                total: items.data.reduce((s: number, i: any) => s + i.price, 0),
              },
            };
          },
        },
      ],
    });

    const summary = await fetch(`${server.url}/api/summary`).then(r => r.json());
    expect(summary).toEqual({ count: 2, total: 3 });

    // Mutate via HTTP then check summary updates
    await fetch(`${server.url}/api/items/2`, { method: 'DELETE' });

    const summary2 = await fetch(`${server.url}/api/summary`).then(r => r.json());
    expect(summary2).toEqual({ count: 1, total: 1 });
  });

  it('handler uses data helpers on other endpoint', async () => {
    server = await mockr({
      endpoints: [
        {
          url: '/api/items',
          data: [
            { id: 1, name: 'Apple', price: 1 },
            { id: 2, name: 'Banana', price: 2 },
          ],
        },
        {
          url: '/api/cart/add',
          method: 'POST',
          handler: (req, { endpoint }) => {
            const items = endpoint('/api/items');
            const item = items.findById((req.body as any).itemId);
            if (!item) return { status: 404, body: { error: 'Item not found' } };
            return { body: { added: item } };
          },
        },
      ],
    });

    const res1 = await fetch(`${server.url}/api/cart/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: 1 }),
    });
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    expect(json1.added.name).toBe('Apple');

    const res2 = await fetch(`${server.url}/api/cart/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: 999 }),
    });
    expect(res2.status).toBe(404);
  });

  it('handler reads dataFile endpoint via ctx.endpoint().data', async () => {
    const fixturesDir = '/tmp/mockr-test-cross-endpoint';
    await mkdir(fixturesDir, { recursive: true });
    const dataPath = `${fixturesDir}/items.json`;
    await writeFile(dataPath, JSON.stringify([
      { id: 1, name: 'Apple', price: 1 },
      { id: 2, name: 'Banana', price: 2 },
    ]));

    server = await mockr({
      endpoints: [
        { url: '/api/items', dataFile: dataPath },
        {
          url: '/api/summary',
          handler: (_req, { endpoint }) => {
            const items = endpoint('/api/items');
            return {
              body: {
                count: items.count(),
                total: items.data.reduce((s: number, i: any) => s + i.price, 0),
              },
            };
          },
        },
      ],
    });

    const summary = await fetch(`${server.url}/api/summary`).then(r => r.json());
    expect(summary).toEqual({ count: 2, total: 3 });
  });
});
