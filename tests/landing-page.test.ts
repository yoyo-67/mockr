import { describe, it, expect, afterEach } from 'vitest';
import { mockr } from '../src/index.js';
import { mockGroup } from '../src/mock-group.js';

const open: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (open.length) {
    const s = open.pop()!;
    try { await s.close(); } catch { /* already closed */ }
  }
});

async function landing(path: string) {
  const defs = mockGroup<{
    '/api/todos': { id: string }[];
    '/api/login': unknown;
    '/api/projects/:projectId/items/': { id: string }[];
  }>()
    .data('/api/todos', [{ id: '1' }])
    .post('/api/login', { fn: () => ({ body: {} }) })
    .data('/api/projects/:projectId/items/', () => [{ id: '1' }])
    .done();
  const server = await mockr({ endpoints: defs as never });
  open.push(server);
  const res = await fetch(`${server.url}${path}`);
  return { res, body: await res.text(), serverUrl: server.url };
}

describe('GET /__mockr/ landing page', () => {
  it('serves HTML at /__mockr/', async () => {
    const { res, body } = await landing('/__mockr/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(body).toMatch(/<!doctype html>/i);
  });

  it('also serves at /__mockr without trailing slash', async () => {
    const { res } = await landing('/__mockr');
    expect(res.status).toBe(200);
  });

  it('links to the internal control APIs', async () => {
    const { body } = await landing('/__mockr/');
    expect(body).toContain('href="/__mockr/openapi.json"');
    expect(body).toContain('href="/__mockr/swagger"');
    expect(body).toContain('href="/__mockr/endpoints"');
  });

  it('lists the registered mocked routes with their methods', async () => {
    const { body } = await landing('/__mockr/');
    expect(body).toContain('/api/todos');
    expect(body).toContain('/api/login');
    expect(body).toContain('POST');
  });

  it('makes a static GET route clickable', async () => {
    const { body } = await landing('/__mockr/');
    expect(body).toContain('href="/api/todos"');
  });

  it('links param routes too, substituting :param with a sample value', async () => {
    const { body } = await landing('/__mockr/');
    // href has the param filled so it is followable...
    expect(body).toContain('href="/api/projects/projectId/items/"');
    // ...while the displayed text keeps the :param pattern.
    expect(body).toContain('/api/projects/:projectId/items/');
  });

  it('links non-GET routes as well', async () => {
    const { body } = await landing('/__mockr/');
    expect(body).toContain('href="/api/login"');
  });
});
