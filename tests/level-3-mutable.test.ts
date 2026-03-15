import { describe, it, expect, afterEach } from 'vitest';
import { mockr } from '../src/index.js';

describe('Level 3 — Mutable data', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => { await server?.close(); });

  it('auto-generates CRUD endpoints', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/items', data: [{ id: 1, name: 'Apple' }] },
      ],
    });

    // GET list
    const list = await fetch(`${server.url}/api/items`).then(r => r.json());
    expect(list).toEqual([{ id: 1, name: 'Apple' }]);

    // GET by id
    const item = await fetch(`${server.url}/api/items/1`).then(r => r.json());
    expect(item).toEqual({ id: 1, name: 'Apple' });

    // POST create
    const created = await fetch(`${server.url}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Banana' }),
    }).then(r => r.json());
    expect(created).toEqual({ id: 2, name: 'Banana' });

    // GET list again
    const list2 = await fetch(`${server.url}/api/items`).then(r => r.json());
    expect(list2).toHaveLength(2);

    // PUT replace
    const replaced = await fetch(`${server.url}/api/items/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Apricot' }),
    }).then(r => r.json());
    expect(replaced).toEqual({ id: 1, name: 'Apricot' });

    // PATCH partial update
    await fetch(`${server.url}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Cherry', color: 'red' }),
    });
    const patched = await fetch(`${server.url}/api/items/3`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: 'dark red' }),
    }).then(r => r.json());
    expect(patched.color).toBe('dark red');
    expect(patched.name).toBe('Cherry');

    // DELETE
    const del = await fetch(`${server.url}/api/items/1`, { method: 'DELETE' });
    expect(del.status).toBe(200);

    // Verify deletion
    const list3 = await fetch(`${server.url}/api/items`).then(r => r.json());
    expect(list3).toEqual([
      { id: 2, name: 'Banana' },
      { id: 3, name: 'Cherry', color: 'dark red' },
    ]);
  });

  it('returns 404 for non-existent items', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/items', data: [{ id: 1, name: 'Apple' }] },
      ],
    });

    const res = await fetch(`${server.url}/api/items/999`);
    expect(res.status).toBe(404);
  });

  it('supports programmatic data mutation', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/items', data: [{ id: 1, name: 'Apple' }] },
      ],
    });

    const items = server.endpoint('/api/items');
    items.insert({ name: 'Banana' });
    expect(items.count()).toBe(2);

    items.clear();
    const list = await fetch(`${server.url}/api/items`).then(r => r.json());
    expect(list).toEqual([]);

    items.reset();
    const list2 = await fetch(`${server.url}/api/items`).then(r => r.json());
    expect(list2).toEqual([{ id: 1, name: 'Apple' }]);
  });

  it('supports data helpers', async () => {
    server = await mockr({
      endpoints: [
        {
          url: '/api/items',
          data: [
            { id: 1, name: 'Apple', price: 1 },
            { id: 2, name: 'Banana', price: 2 },
            { id: 3, name: 'Avocado', price: 1 },
          ],
        },
      ],
    });

    const items = server.endpoint('/api/items');

    expect(items.findById(1)).toEqual({ id: 1, name: 'Apple', price: 1 });
    expect(items.findById(999)).toBeUndefined();

    expect(items.where({ price: 1 })).toHaveLength(2);
    expect(items.where((i: any) => i.name.startsWith('A'))).toHaveLength(2);

    expect(items.first()).toEqual({ id: 1, name: 'Apple', price: 1 });
    expect(items.count()).toBe(3);
    expect(items.has(1)).toBe(true);
    expect(items.has(999)).toBe(false);

    items.update(1, { name: 'Apricot' });
    expect(items.findById(1)!.name).toBe('Apricot');

    items.remove(2);
    expect(items.count()).toBe(2);
    expect(items.has(2)).toBe(false);
  });
});
