import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mockr, mockGroup, hydrate } from '../src/index.js';

interface Backend {
  url: string;
  close: () => Promise<void>;
  setResponse: (body: unknown) => void;
  hitCount: () => number;
}

function spawnBackend(): Promise<Backend> {
  let body: unknown = [];
  let hits = 0;
  const httpServer: HttpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    hits++;
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    });
  });
  return new Promise((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      if (!addr || typeof addr === 'string') throw new Error('no address');
      resolve({
        url: `http://localhost:${addr.port}`,
        close: () => new Promise<void>((r, rj) => httpServer.close((e) => (e ? rj(e) : r()))),
        setResponse: (b) => { body = b; },
        hitCount: () => hits,
      });
    });
  });
}

interface Todo { id: number; title: string }

describe('hydrate(loader)', () => {
  const open: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (open.length) {
      const s = open.pop()!;
      try { await s.close(); } catch { /* already closed */ }
    }
  });

  it('fills the store from upstream on first GET (loader runs once)', async () => {
    const backend = await spawnBackend();
    open.push(backend);
    backend.setResponse([{ id: 1, title: 'milk' }]);

    const server = await mockr<{ '/api/todos': Todo[] }>({
      proxy: { target: backend.url },
      endpoints: mockGroup<{ '/api/todos': Todo[] }>()
        .data('/api/todos', hydrate((_req, ctx) => ctx.forward<Todo[]>().then((r) => r.body)))
        .done(),
    });
    open.push(server);

    const res = await fetch(`${server.url}/api/todos`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 1, title: 'milk' }]);
    expect(backend.hitCount()).toBe(1);
  });

  it('owns the snapshot — later GETs serve the store, never re-forward', async () => {
    const backend = await spawnBackend();
    open.push(backend);
    backend.setResponse([{ id: 1, title: 'milk' }]);

    const server = await mockr<{ '/api/todos': Todo[] }>({
      proxy: { target: backend.url },
      endpoints: mockGroup<{ '/api/todos': Todo[] }>()
        .data('/api/todos', hydrate((_req, ctx) => ctx.forward<Todo[]>().then((r) => r.body)))
        .done(),
    });
    open.push(server);

    await fetch(`${server.url}/api/todos`); // first GET hydrates
    backend.setResponse([{ id: 1, title: 'CHANGED UPSTREAM' }]); // upstream flips

    const res2 = await fetch(`${server.url}/api/todos`);
    expect(await res2.json()).toEqual([{ id: 1, title: 'milk' }]); // still the snapshot
    expect(backend.hitCount()).toBe(1); // no second forward
  });

  it('default CRUD mutations stick over the hydrated snapshot', async () => {
    const backend = await spawnBackend();
    open.push(backend);
    backend.setResponse([{ id: 1, title: 'milk' }]);

    const server = await mockr<{ '/api/todos': Todo[] }>({
      proxy: { target: backend.url },
      endpoints: mockGroup<{ '/api/todos': Todo[] }>()
        .data('/api/todos', hydrate((_req, ctx) => ctx.forward<Todo[]>().then((r) => r.body)))
        .done(),
    });
    open.push(server);

    await fetch(`${server.url}/api/todos`); // hydrate
    await fetch(`${server.url}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'eggs' }),
    });

    const res = await fetch(`${server.url}/api/todos`);
    expect(await res.json()).toEqual([
      { id: 1, title: 'milk' },
      { id: 2, title: 'eggs' },
    ]);
    expect(backend.hitCount()).toBe(1); // POST + later GET never re-forward
  });

  it('E1: a mutation before the first GET latches ownership — loader never clobbers it', async () => {
    const backend = await spawnBackend();
    open.push(backend);
    backend.setResponse([{ id: 1, title: 'milk' }]); // upstream has milk

    const server = await mockr<{ '/api/todos': Todo[] }>({
      proxy: { target: backend.url },
      endpoints: mockGroup<{ '/api/todos': Todo[] }>()
        .data('/api/todos', hydrate((_req, ctx) => ctx.forward<Todo[]>().then((r) => r.body)))
        .done(),
    });
    open.push(server);

    // POST arrives BEFORE any GET — store still empty seed []
    await fetch(`${server.url}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'eggs' }),
    });

    const res = await fetch(`${server.url}/api/todos`);
    expect(await res.json()).toEqual([{ id: 1, title: 'eggs' }]); // POST kept, upstream NOT fetched
    expect(backend.hitCount()).toBe(0); // loader never ran
  });

  it('E2: upstream returning [] latches — no re-load on later GETs', async () => {
    const backend = await spawnBackend();
    open.push(backend);
    backend.setResponse([]); // upstream genuinely empty

    const server = await mockr<{ '/api/todos': Todo[] }>({
      proxy: { target: backend.url },
      endpoints: mockGroup<{ '/api/todos': Todo[] }>()
        .data('/api/todos', hydrate((_req, ctx) => ctx.forward<Todo[]>().then((r) => r.body)))
        .done(),
    });
    open.push(server);

    expect(await (await fetch(`${server.url}/api/todos`)).json()).toEqual([]);
    expect(await (await fetch(`${server.url}/api/todos`)).json()).toEqual([]);
    expect(backend.hitCount()).toBe(1); // empty is a real answer, not "unfetched"
  });

  it('proxy-agnostic: an inline loader (no forward) works without a proxy target', async () => {
    const server = await mockr<{ '/api/cfg': Todo[] }>({
      endpoints: mockGroup<{ '/api/cfg': Todo[] }>()
        .data('/api/cfg', hydrate(() => [{ id: 7, title: 'from-inline' }]))
        .done(),
    });
    open.push(server);

    expect(await (await fetch(`${server.url}/api/cfg`)).json()).toEqual([{ id: 7, title: 'from-inline' }]);
  });

  it('E4: concurrent first GETs run the loader exactly once', async () => {
    const backend = await spawnBackend();
    open.push(backend);
    backend.setResponse([{ id: 1, title: 'milk' }]);

    const server = await mockr<{ '/api/todos': Todo[] }>({
      proxy: { target: backend.url },
      endpoints: mockGroup<{ '/api/todos': Todo[] }>()
        .data('/api/todos', hydrate((_req, ctx) => ctx.forward<Todo[]>().then((r) => r.body)))
        .done(),
    });
    open.push(server);

    await Promise.all([
      fetch(`${server.url}/api/todos`),
      fetch(`${server.url}/api/todos`),
      fetch(`${server.url}/api/todos`),
    ]);
    expect(backend.hitCount()).toBe(1); // in-flight guard collapses the race
  });

  it('reset() re-arms — the next GET re-loads from upstream', async () => {
    const backend = await spawnBackend();
    open.push(backend);
    backend.setResponse([{ id: 1, title: 'milk' }]);

    const server = await mockr<{ '/api/todos': Todo[] }>({
      proxy: { target: backend.url },
      endpoints: mockGroup<{ '/api/todos': Todo[] }>()
        .data('/api/todos', hydrate((_req, ctx) => ctx.forward<Todo[]>().then((r) => r.body)))
        .done(),
    });
    open.push(server);

    await fetch(`${server.url}/api/todos`); // hydrate
    backend.setResponse([{ id: 2, title: 'bread' }]); // upstream changes
    server.endpoint('/api/todos').reset(); // re-arm

    const res = await fetch(`${server.url}/api/todos`);
    expect(await res.json()).toEqual([{ id: 2, title: 'bread' }]); // re-loaded
    expect(backend.hitCount()).toBe(2);
  });

  it('E3: a loader failure does not latch — the next GET retries', async () => {
    let attempt = 0;
    const server = await mockr<{ '/api/x': Todo[] }>({
      endpoints: mockGroup<{ '/api/x': Todo[] }>()
        .data('/api/x', hydrate(() => {
          attempt++;
          if (attempt === 1) throw new Error('upstream down');
          return [{ id: 1, title: 'recovered' }];
        }))
        .done(),
    });
    open.push(server);

    const r1 = await fetch(`${server.url}/api/x`);
    expect(r1.status).toBeGreaterThanOrEqual(500); // first load failed

    const r2 = await fetch(`${server.url}/api/x`); // retry
    expect(await r2.json()).toEqual([{ id: 1, title: 'recovered' }]);
    expect(attempt).toBe(2);
  });

  it('hydrates a record (object) endpoint and mutates nested data through the handle', async () => {
    interface CompaniesResponse { companies: { id: string; name: string }[] }
    const backend = await spawnBackend();
    open.push(backend);
    backend.setResponse({ companies: [{ id: 'a', name: 'Acme' }] });

    const server = await mockr<{ '/api/companies': CompaniesResponse }>({
      proxy: { target: backend.url },
      endpoints: mockGroup<{ '/api/companies': CompaniesResponse }>()
        .data('/api/companies', hydrate((_req, ctx) => ctx.forward<CompaniesResponse>().then((r) => r.body)))
        .post('/api/companies', (_req, ctx) => {
          const store = ctx.endpoint('/api/companies').data as CompaniesResponse;
          store.companies.push({ id: 'b', name: 'Beta' });
          return ctx.created({ id: 'b' });
        })
        .done(),
    });
    open.push(server);

    expect(await (await fetch(`${server.url}/api/companies`)).json()).toEqual({
      companies: [{ id: 'a', name: 'Acme' }],
    });
    await fetch(`${server.url}/api/companies`, { method: 'POST' });
    expect(await (await fetch(`${server.url}/api/companies`)).json()).toEqual({
      companies: [{ id: 'a', name: 'Acme' }, { id: 'b', name: 'Beta' }],
    });
    expect(backend.hitCount()).toBe(1);
  });

  it('E14: a forward loader with no proxy target surfaces an error', async () => {
    const server = await mockr<{ '/api/y': Todo[] }>({
      endpoints: mockGroup<{ '/api/y': Todo[] }>()
        .data('/api/y', hydrate((_req, ctx) => ctx.forward<Todo[]>().then((r) => r.body)))
        .done(),
    });
    open.push(server);

    const res = await fetch(`${server.url}/api/y`);
    expect(res.status).toBeGreaterThanOrEqual(500); // forward() requires proxy.target
  });
});
