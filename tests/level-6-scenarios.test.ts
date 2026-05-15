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

  it('scenario can set per-route delay via s.endpoint(url).setDelay()', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/items', data: [{ id: 1, name: 'Apple' }] },
      ],
      scenarios: {
        'slow': (s) => {
          s.endpoint('/api/items').setDelay(60);
        },
      },
    });

    // Baseline: no delay
    const start1 = Date.now();
    const r1 = await fetch(`${server.url}/api/items`);
    expect(Date.now() - start1).toBeLessThan(40);
    expect(r1.headers.get('x-mockr-delay')).toBeNull();

    await server.scenario('slow');

    const start2 = Date.now();
    const r2 = await fetch(`${server.url}/api/items`);
    expect(Date.now() - start2).toBeGreaterThanOrEqual(40);
    expect(r2.headers.get('x-mockr-delay')).toBe('60');
  });

  it('scenario deactivate restores baseline delay (none → delay → switch back)', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/items', data: [{ id: 1 }] },
      ],
      scenarios: {
        'slow': (s) => { s.endpoint('/api/items').setDelay(80); },
        'empty': () => {},
      },
    });

    await server.scenario('slow');
    const r1 = await fetch(`${server.url}/api/items`);
    expect(r1.headers.get('x-mockr-delay')).toBe('80');

    await server.scenario('empty');
    const start = Date.now();
    const r2 = await fetch(`${server.url}/api/items`);
    expect(Date.now() - start).toBeLessThan(40);
    expect(r2.headers.get('x-mockr-delay')).toBeNull();
  });

  it('server.reset() restores baseline delay', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/items', data: [{ id: 1 }], delay: 50 },
      ],
    });

    // Mutate via runtime API
    server.endpoint('/api/items').setDelay(200);
    const r1 = await fetch(`${server.url}/api/items`);
    expect(r1.headers.get('x-mockr-delay')).toBe('200');

    await server.reset();
    const r2 = await fetch(`${server.url}/api/items`);
    // Baseline was 50, reset restores it
    expect(r2.headers.get('x-mockr-delay')).toBe('50');
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
