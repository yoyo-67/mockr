import { describe, it, expect, afterEach } from 'vitest';
import { mockr } from '../src/server.js';
import type { MockrServer } from '../src/types.js';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Recorder integration (server routes)', () => {
  let server: MockrServer;
  let sessionsDir: string;
  let mocksDir: string;

  afterEach(async () => {
    if (server) await server.close();
    if (sessionsDir) await rm(sessionsDir, { recursive: true, force: true });
    if (mocksDir) await rm(mocksDir, { recursive: true, force: true });
  });

  async function setup() {
    sessionsDir = await mkdtemp(join(tmpdir(), 'mockr-rec-'));
    mocksDir = await mkdtemp(join(tmpdir(), 'mockr-mocks-'));
    server = await mockr({
      port: 0,
      recorder: { sessionsDir, mocksDir },
      endpoints: [
        { url: '/api/existing', body: { hello: 'world' } },
      ],
    });
  }

  async function recordSession(name: string, entries: { url: string; method: string; status: number; contentType: string; body: string }[]) {
    const startRes = await fetch(`${server.url}/__mockr/record/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const { sessionId } = await startRes.json() as any;

    const entryIds: string[] = [];
    for (const entry of entries) {
      const res = await fetch(`${server.url}/__mockr/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, ...entry, responseHeaders: {} }),
      });
      const recorded = await res.json() as any;
      entryIds.push(recorded.id);
    }

    await fetch(`${server.url}/__mockr/record/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });

    return { sessionId, entryIds };
  }

  it('starts and stops a recording session via HTTP', async () => {
    await setup();

    const startRes = await fetch(`${server.url}/__mockr/record/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-session', baseUrl: 'http://example.com' }),
    });
    expect(startRes.status).toBe(200);
    const startBody = await startRes.json() as any;
    expect(startBody.sessionId).toBeTruthy();

    const sessionId = startBody.sessionId;

    const recordRes = await fetch(`${server.url}/__mockr/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        url: 'http://example.com/api/users',
        method: 'GET',
        status: 200,
        contentType: 'application/json',
        responseHeaders: {},
        body: JSON.stringify([{ id: 1, name: 'Alice' }]),
      }),
    });
    expect(recordRes.status).toBe(200);

    const stopRes = await fetch(`${server.url}/__mockr/record/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    expect(stopRes.status).toBe(200);
    const stopBody = await stopRes.json() as any;
    expect(stopBody.entryCount).toBe(1);
  });

  it('lists and deletes sessions', async () => {
    await setup();
    const { sessionId } = await recordSession('list-test', [
      { url: 'http://example.com/api/data', method: 'GET', status: 200, contentType: 'application/json', body: '[]' },
    ]);

    const listRes = await fetch(`${server.url}/__mockr/sessions`);
    const sessions = await listRes.json() as any[];
    expect(sessions.some((s: any) => s.name === 'list-test')).toBe(true);

    await fetch(`${server.url}/__mockr/sessions/${sessionId}`, { method: 'DELETE' });
    const listRes2 = await fetch(`${server.url}/__mockr/sessions`);
    const sessions2 = await listRes2.json() as any[];
    expect(sessions2.some((s: any) => s.id === sessionId)).toBe(false);
  });

  it('returns CORS headers on recorder routes', async () => {
    await setup();
    const res = await fetch(`${server.url}/__mockr/sessions`);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('handles OPTIONS preflight on recorder routes', async () => {
    await setup();
    const res = await fetch(`${server.url}/__mockr/record/start`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('returns error when recorder is not enabled', async () => {
    server = await mockr({ port: 0 });
    const res = await fetch(`${server.url}/__mockr/sessions`);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain('not enabled');
  });

  it('unknown __mockr/* routes return 404, not fall through to proxy', async () => {
    sessionsDir = await mkdtemp(join(tmpdir(), 'mockr-rec-'));
    mocksDir = await mkdtemp(join(tmpdir(), 'mockr-mocks-'));
    const target = await mockr({ port: 0, endpoints: [{ url: '/api/target', body: 'from-proxy' }] });
    server = await mockr({
      port: 0,
      recorder: { sessionsDir, mocksDir },
      proxy: { target: target.url },
    });

    const res = await fetch(`${server.url}/__mockr/record/start`); // GET, not POST
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toContain('Unknown recorder route');

    await target.close();
  });

  // Map to file tests

  it('maps recorded entries to JSON files and creates endpoints', async () => {
    await setup();
    const { sessionId, entryIds } = await recordSession('map-test', [
      { url: 'http://example.com/api/users', method: 'GET', status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 1, name: 'Alice' }]) },
    ]);

    const mapRes = await fetch(`${server.url}/__mockr/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, entryIds }),
    });
    expect(mapRes.status).toBe(200);
    const mapBody = await mapRes.json() as any;
    expect(mapBody.mapped).toHaveLength(1);
    expect(mapBody.mapped[0].url).toBe('/api/users');
    expect(mapBody.mapped[0].bodyFile).toContain('api-users.json');

    // Verify JSON file was written
    const content = await readFile(join(mocksDir, 'api-users.json'), 'utf-8');
    expect(JSON.parse(content)).toEqual([{ id: 1, name: 'Alice' }]);

    // Verify endpoint was created and serves the data
    const dataRes = await fetch(`${server.url}/api/users`);
    expect(dataRes.status).toBe(200);
    expect(await dataRes.json()).toEqual([{ id: 1, name: 'Alice' }]);
  });

  it('generates TypeScript interface files', async () => {
    await setup();
    const { sessionId, entryIds } = await recordSession('types-test', [
      { url: 'http://example.com/api/config', method: 'GET', status: 200, contentType: 'application/json', body: JSON.stringify({ theme: 'dark', lang: 'en' }) },
    ]);

    const mapRes = await fetch(`${server.url}/__mockr/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, entryIds, generateTypes: true }),
    });
    const mapBody = await mapRes.json() as any;
    expect(mapBody.mapped[0].typesFile).toContain('api-config.d.ts');

    // Verify .d.ts file was written
    const typesContent = await readFile(join(mocksDir, 'api-config.d.ts'), 'utf-8');
    expect(typesContent).toContain('export interface');
    expect(typesContent).toContain('theme');
    expect(typesContent).toContain('lang');
  });

  it('skips type generation when generateTypes is false', async () => {
    await setup();
    const { sessionId, entryIds } = await recordSession('no-types-test', [
      { url: 'http://example.com/api/data', method: 'GET', status: 200, contentType: 'application/json', body: '{}' },
    ]);

    const mapRes = await fetch(`${server.url}/__mockr/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, entryIds, generateTypes: false }),
    });
    const mapBody = await mapRes.json() as any;
    expect(mapBody.mapped[0].typesFile).toBeUndefined();

    // Verify no .d.ts file
    await expect(stat(join(mocksDir, 'api-data.d.ts'))).rejects.toThrow();
  });

  it('mapped endpoints show in listEndpoints', async () => {
    await setup();
    const { sessionId, entryIds } = await recordSession('list-ep-test', [
      { url: 'http://example.com/api/mapped', method: 'GET', status: 200, contentType: 'application/json', body: '"hello"' },
    ]);

    await fetch(`${server.url}/__mockr/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, entryIds }),
    });

    const eps = server.listEndpoints();
    expect(eps.some(e => e.url === '/api/mapped')).toBe(true);
  });

  it('updates existing endpoint when mapping same URL twice', async () => {
    await setup();

    // First map
    const { sessionId: s1, entryIds: e1 } = await recordSession('map-1', [
      { url: 'http://example.com/api/items', method: 'GET', status: 200, contentType: 'application/json', body: '"v1"' },
    ]);
    await fetch(`${server.url}/__mockr/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: s1, entryIds: e1 }),
    });

    // Second map with different body
    const { sessionId: s2, entryIds: e2 } = await recordSession('map-2', [
      { url: 'http://example.com/api/items', method: 'GET', status: 200, contentType: 'application/json', body: '"v2"' },
    ]);
    await fetch(`${server.url}/__mockr/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: s2, entryIds: e2 }),
    });

    // Should serve updated value
    const res = await fetch(`${server.url}/api/items`);
    expect(await res.json()).toBe('v2');

    // Should not duplicate endpoints
    const eps = server.listEndpoints().filter(e => e.url === '/api/items');
    expect(eps).toHaveLength(1);
  });

  it('serves 304 entries as 200', async () => {
    await setup();
    const { sessionId, entryIds } = await recordSession('304-test', [
      { url: 'http://example.com/api/cached', method: 'GET', status: 304, contentType: 'application/json', body: '{"cached":true}' },
    ]);

    await fetch(`${server.url}/__mockr/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, entryIds }),
    });

    const res = await fetch(`${server.url}/api/cached`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cached: true });
  });

  it('GET /__mockr/map/endpoints lists mapped endpoints', async () => {
    await setup();
    const { sessionId, entryIds } = await recordSession('map-list-test', [
      { url: 'http://example.com/api/listed', method: 'GET', status: 200, contentType: 'application/json', body: '{}' },
    ]);

    await fetch(`${server.url}/__mockr/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, entryIds }),
    });

    const res = await fetch(`${server.url}/__mockr/map/endpoints`);
    expect(res.status).toBe(200);
    const endpoints = await res.json() as any[];
    expect(endpoints.some((e: any) => e.url === '/api/listed')).toBe(true);
  });

  it('server.recorder API exposes mapToFile', async () => {
    await setup();
    expect(server.recorder).not.toBeNull();

    const s = await server.recorder!.startSession('api-test', 'http://test.com');
    expect(s.id).toBeTruthy();
    await server.recorder!.stopSession(s.id);

    const sessions = await server.recorder!.listSessions();
    expect(sessions.some(x => x.name === 'api-test')).toBe(true);
  });

  it('server.recorder is null when recorder not configured', async () => {
    server = await mockr({ port: 0 });
    expect(server.recorder).toBeNull();
  });
});
