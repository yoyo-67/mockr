import { describe, it, expect, afterEach } from 'vitest';
import { mockr } from '../src/index.js';

describe('PUT /__mockr/endpoints/:url/delay', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => { await server?.close(); });

  function delayUrl(serverUrl: string, endpointUrl: string): string {
    return `${serverUrl}/__mockr/endpoints/${encodeURIComponent(endpointUrl)}/delay`;
  }

  it('sets a fixed-ms delay via control route', async () => {
    server = await mockr({
      endpoints: [{ url: '/api/users', data: [{ id: 1 }] }],
    });

    const setRes = await fetch(delayUrl(server.url, '/api/users'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 60 }),
    });
    expect(setRes.status).toBe(200);

    const start = Date.now();
    const res = await fetch(`${server.url}/api/users`);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    expect(res.headers.get('x-mockr-delay')).toBe('60');
  });

  it('sets a {min, max} window via control route', async () => {
    server = await mockr({
      endpoints: [{ url: '/api/users', data: [{ id: 1 }] }],
    });

    const setRes = await fetch(delayUrl(server.url, '/api/users'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: { min: 40, max: 80 } }),
    });
    expect(setRes.status).toBe(200);

    const res = await fetch(`${server.url}/api/users`);
    const headerVal = Number(res.headers.get('x-mockr-delay'));
    expect(headerVal).toBeGreaterThanOrEqual(40);
    expect(headerVal).toBeLessThanOrEqual(80);
  });

  it('clears delay via DELETE', async () => {
    server = await mockr({
      endpoints: [{ url: '/api/users', data: [{ id: 1 }], delay: 100 }],
    });

    const delRes = await fetch(delayUrl(server.url, '/api/users'), {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(200);

    const start = Date.now();
    const res = await fetch(`${server.url}/api/users`);
    expect(Date.now() - start).toBeLessThan(50);
    expect(res.headers.get('x-mockr-delay')).toBeNull();
  });

  it('clears delay via PUT with body { value: null }', async () => {
    server = await mockr({
      endpoints: [{ url: '/api/users', data: [{ id: 1 }], delay: 100 }],
    });

    const setRes = await fetch(delayUrl(server.url, '/api/users'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: null }),
    });
    expect(setRes.status).toBe(200);

    const start = Date.now();
    const res = await fetch(`${server.url}/api/users`);
    expect(Date.now() - start).toBeLessThan(50);
    expect(res.headers.get('x-mockr-delay')).toBeNull();
  });

  it('returns 400 on invalid value (negative)', async () => {
    server = await mockr({
      endpoints: [{ url: '/api/users', data: [{ id: 1 }] }],
    });

    const res = await fetch(delayUrl(server.url, '/api/users'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: -50 }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/>= 0/);
  });

  it('returns 400 on invalid shape ({ms} not allowed)', async () => {
    server = await mockr({
      endpoints: [{ url: '/api/users', data: [{ id: 1 }] }],
    });

    const res = await fetch(delayUrl(server.url, '/api/users'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: { ms: 500 } }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown endpoint URL', async () => {
    server = await mockr({
      endpoints: [{ url: '/api/users', data: [{ id: 1 }] }],
    });

    const res = await fetch(delayUrl(server.url, '/api/nope'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 60 }),
    });
    expect(res.status).toBe(404);
  });
});
