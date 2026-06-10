import { describe, it, expect, afterEach } from 'vitest';
import { renderSwaggerPage } from '../src/swagger-page.js';
import { mockr } from '../src/index.js';
import { mockGroup } from '../src/mock-group.js';

describe('renderSwaggerPage()', () => {
  it('returns an HTML document with a swagger-ui mount node', () => {
    const html = renderSwaggerPage();
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain('id="swagger-ui"');
  });

  it('points Swagger UI at the live /__mockr/openapi.json spec', () => {
    const html = renderSwaggerPage();
    expect(html).toContain('/__mockr/openapi.json');
  });

  it('references the swagger-ui-dist CDN assets (css + js bundle)', () => {
    const html = renderSwaggerPage();
    expect(html).toMatch(/swagger-ui-dist.*swagger-ui\.css/);
    expect(html).toMatch(/swagger-ui-dist.*swagger-ui-bundle\.js/);
  });
});

const open: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (open.length) {
    const s = open.pop()!;
    try { await s.close(); } catch { /* already closed */ }
  }
});

describe('GET /__mockr/swagger', () => {
  it('serves the Swagger UI HTML page', async () => {
    const defs = mockGroup<{ '/api/config': { theme: string } }>()
      .get('/api/config', () => ({ body: { theme: 'x' } }))
      .done();
    const server = await mockr({ endpoints: defs as never });
    open.push(server);

    const res = await fetch(`${server.url}/__mockr/swagger`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain('id="swagger-ui"');
    expect(body).toContain('/__mockr/openapi.json');
  });
});
