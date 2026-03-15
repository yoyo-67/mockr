import { describe, it, expect, afterEach } from 'vitest';
import { mockr } from '../src/index.js';

describe('Level 6 — Scenarios', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => { await server?.close(); });

  it('applies scenario on demand', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/items', data: [] as { id: number; name: string }[] },
      ],
      scenarios: {
        'full': (s) => {
          s.endpoint('/api/items').insert({ name: 'Apple' });
          s.endpoint('/api/items').insert({ name: 'Banana' });
        },
        'empty': () => {},
      },
    });

    let list = await fetch(`${server.url}/api/items`).then(r => r.json());
    expect(list).toHaveLength(0);

    await server.scenario('full');
    list = await fetch(`${server.url}/api/items`).then(r => r.json());
    expect(list).toHaveLength(2);
  });

  it('reset restores initial data, not scenario', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/items', data: [] as { id: number; name: string }[] },
      ],
      scenarios: {
        'full': (s) => {
          s.endpoint('/api/items').insert({ name: 'Apple' });
          s.endpoint('/api/items').insert({ name: 'Banana' });
        },
        'empty': () => {},
      },
    });

    await server.scenario('full');
    let list = await fetch(`${server.url}/api/items`).then(r => r.json());
    expect(list).toHaveLength(2);

    await server.reset();
    list = await fetch(`${server.url}/api/items`).then(r => r.json());
    expect(list).toHaveLength(0);
  });

  it('switches scenarios via HTTP', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/items', data: [] as { id: number; name: string }[] },
      ],
      scenarios: {
        'full': (s) => {
          s.endpoint('/api/items').insert({ name: 'Apple' });
        },
        'empty': () => {},
      },
    });

    await fetch(`${server.url}/__mockr/scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'full' }),
    });

    let list = await fetch(`${server.url}/api/items`).then(r => r.json());
    expect(list).toHaveLength(1);

    await fetch(`${server.url}/__mockr/scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'empty' }),
    });

    list = await fetch(`${server.url}/api/items`).then(r => r.json());
    expect(list).toHaveLength(0);
  });

  it('scenario can override handler', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/items', data: [{ id: 1, name: 'Apple' }] },
      ],
      scenarios: {
        'error': (s) => {
          s.endpoint('/api/items').handler = () => ({
            status: 500, body: { error: 'Down' },
          });
        },
      },
    });

    let res = await fetch(`${server.url}/api/items`);
    expect(res.status).toBe(200);

    await server.scenario('error');
    res = await fetch(`${server.url}/api/items`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Down' });

    await server.reset();
    res = await fetch(`${server.url}/api/items`);
    expect(res.status).toBe(200);
  });
});
