import { describe, it, expect, afterEach } from 'vitest';
import { mockr } from '../src/index.js';
import { mockGroup } from '../src/mock-group.js';

interface Todo {
  id: number;
  title: string;
}

type E = {
  '/api/todos': Todo[];
  '/api/todos/:id': Todo;
  '/internal/todos': Todo[];
};

describe('mockGroup — done() output shape', () => {
  it('single verb emits a { url, method, handler } def', () => {
    const defs = mockGroup<E>()
      .get('/api/todos', () => ({ body: [] }))
      .done();

    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatchObject({ url: '/api/todos', method: 'GET' });
    expect('handler' in defs[0]).toBe(true);
  });

  it('merges multiple verbs on one url into a single { url, methods } def', () => {
    const defs = mockGroup<E>()
      .post('/api/todos', () => ({ body: [] }))
      .get('/api/todos', () => ({ body: [] }))
      .done();

    expect(defs).toHaveLength(1);
    const def = defs[0] as { url: string; methods: Record<string, unknown> };
    expect(def.url).toBe('/api/todos');
    expect(Object.keys(def.methods).sort()).toEqual(['GET', 'POST']);
  });

  it('data(url, seed) emits a { url, data } def', () => {
    const seed: Todo[] = [{ id: 1, title: 'a' }];
    const defs = mockGroup<E>().data('/internal/todos', seed).done();

    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatchObject({ url: '/internal/todos', data: seed });
  });

  it('throws on duplicate url+verb', () => {
    const mock = mockGroup<E>().get('/api/todos', () => ({ body: [] }));
    expect(() => mock.get('/api/todos', () => ({ body: [] }))).toThrow(/GET .*\/api\/todos/);
  });
});

describe('mockGroup — runtime through mockr', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => {
    await server?.close();
  });

  it('serves a GET handler body', async () => {
    server = await mockr({
      endpoints: mockGroup<E>()
        .get('/api/todos', () => ({ body: [{ id: 1, title: 'milk' }] }))
        .done(),
    });

    const res = await fetch(`${server.url}/api/todos`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 1, title: 'milk' }]);
  });

  it('routes each verb of a merged url to its own handler', async () => {
    server = await mockr({
      endpoints: mockGroup<E>()
        .get('/api/todos', () => ({ body: [{ id: 1, title: 'list' }] }))
        .post('/api/todos', () => ({ status: 201, body: [{ id: 2, title: 'made' }] }))
        .done(),
    });

    const get = await fetch(`${server.url}/api/todos`);
    expect(await get.json()).toEqual([{ id: 1, title: 'list' }]);

    const post = await fetch(`${server.url}/api/todos`, { method: 'POST' });
    expect(post.status).toBe(201);
    expect(await post.json()).toEqual([{ id: 2, title: 'made' }]);
  });

  it('exposes path params parsed from the :name pattern', async () => {
    server = await mockr({
      endpoints: mockGroup<E>()
        .get('/api/todos/:id', (req) => ({ body: { id: Number(req.params.id), title: 'x' } }))
        .done(),
    });

    const res = await fetch(`${server.url}/api/todos/7`);
    expect(await res.json()).toEqual({ id: 7, title: 'x' });
  });

  it('gives a data() endpoint default CRUD', async () => {
    server = await mockr({
      endpoints: mockGroup<E>()
        .data('/internal/todos', [{ id: 1, title: 'seed' }])
        .done(),
    });

    const list = await fetch(`${server.url}/internal/todos`);
    expect(await list.json()).toEqual([{ id: 1, title: 'seed' }]);

    const created = await fetch(`${server.url}/internal/todos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 2, title: 'new' }),
    });
    expect(created.status).toBe(201);

    const after = await fetch(`${server.url}/internal/todos`);
    expect(await after.json()).toHaveLength(2);
  });

  it('lets a handler read another endpoint store via ctx.endpoint', async () => {
    server = await mockr({
      endpoints: mockGroup<E>()
        .data('/internal/todos', [{ id: 1, title: 'shared' }])
        .get('/api/todos', (_req, ctx) => ({ body: ctx.endpoint('/internal/todos').data }))
        .done(),
    });

    const res = await fetch(`${server.url}/api/todos`);
    expect(await res.json()).toEqual([{ id: 1, title: 'shared' }]);
  });
});

describe('mockGroup — direct body return', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => {
    await server?.close();
  });

  it('returns a bare array as the body', async () => {
    server = await mockr({
      endpoints: mockGroup<E>()
        .get('/api/todos', () => [{ id: 1, title: 'bare' }])
        .done(),
    });

    const res = await fetch(`${server.url}/api/todos`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 1, title: 'bare' }]);
  });

  it('returns a bare record object as the body', async () => {
    server = await mockr({
      endpoints: mockGroup<E>()
        .get('/api/todos/:id', (req) => ({ id: Number(req.params.id), title: 'x' }))
        .done(),
    });

    const res = await fetch(`${server.url}/api/todos/3`);
    expect(await res.json()).toEqual({ id: 3, title: 'x' });
  });

  it('normalizes a bare body from an async handler', async () => {
    server = await mockr({
      endpoints: mockGroup<E>()
        .get('/api/todos', async () => [{ id: 5, title: 'async' }])
        .done(),
    });

    const res = await fetch(`${server.url}/api/todos`);
    expect(await res.json()).toEqual([{ id: 5, title: 'async' }]);
  });

  it('still honors { body, status } for explicit status/headers', async () => {
    server = await mockr({
      endpoints: mockGroup<E>()
        .post('/api/todos', () => ({ status: 201, body: [{ id: 9, title: 'made' }] }))
        .done(),
    });

    const res = await fetch(`${server.url}/api/todos`, { method: 'POST' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual([{ id: 9, title: 'made' }]);
  });
});

describe('mockGroup — ctx shorthands', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => {
    await server?.close();
  });

  it('ctx.error sets the status and an { error } body', async () => {
    server = await mockr({
      endpoints: mockGroup<E>()
        .get('/api/todos/:id', (req, ctx) =>
          req.params.id === '0' ? ctx.error(404, 'gone') : { id: 1, title: 'a' }
        )
        .done(),
    });

    const res = await fetch(`${server.url}/api/todos/0`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'gone' });
  });

  it('ctx.created sets 201 and echoes the body', async () => {
    server = await mockr({
      endpoints: mockGroup<E>()
        .post('/api/todos', (_req, ctx) => ctx.created([{ id: 2, title: 'new' }]))
        .done(),
    });

    const res = await fetch(`${server.url}/api/todos`, { method: 'POST' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual([{ id: 2, title: 'new' }]);
  });

  it('ctx.noContent sets 204', async () => {
    server = await mockr({
      endpoints: mockGroup<E>()
        .delete('/api/todos/:id', (_req, ctx) => ctx.noContent())
        .done(),
    });

    const res = await fetch(`${server.url}/api/todos/1`, { method: 'DELETE' });
    expect(res.status).toBe(204);
  });
});

describe('mockGroup — prefix', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => {
    await server?.close();
  });

  it('prepends the prefix in done() urls', () => {
    const defs = mockGroup<E>()
      .prefix('/api')
      .get('/todos', () => [])
      .done();

    expect(defs[0]).toMatchObject({ url: '/api/todos', method: 'GET' });
  });

  it('serves prefixed routes at runtime', async () => {
    server = await mockr({
      endpoints: mockGroup<E>()
        .prefix('/api')
        .get('/todos', () => [{ id: 1, title: 'p' }])
        .get('/todos/:id', (req) => ({ id: Number(req.params.id), title: 'one' }))
        .done(),
    });

    const list = await fetch(`${server.url}/api/todos`);
    expect(await list.json()).toEqual([{ id: 1, title: 'p' }]);

    const one = await fetch(`${server.url}/api/todos/4`);
    expect(await one.json()).toEqual({ id: 4, title: 'one' });
  });
});

describe('mockGroup — scenario presets', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => {
    await server?.close();
  });

  it('serves a named preset selected by the x-mockr-scenario header', async () => {
    server = await mockr({
      endpoints: mockGroup<E>()
        .get('/api/todos', {
          scenarios: {
            empty: () => [],
            boom: (_req, ctx) => ctx.error(500, 'down'),
          },
          fn: () => [{ id: 1, title: 'normal' }],
        })
        .done(),
    });

    expect(await (await fetch(`${server.url}/api/todos`)).json()).toEqual([{ id: 1, title: 'normal' }]);
    expect(
      await (await fetch(`${server.url}/api/todos`, { headers: { 'x-mockr-scenario': 'empty' } })).json()
    ).toEqual([]);
    const boom = await fetch(`${server.url}/api/todos`, { headers: { 'x-mockr-scenario': 'boom' } });
    expect(boom.status).toBe(500);
  });

  it('serves a static preset selected by the _scenario query param', async () => {
    server = await mockr({
      endpoints: mockGroup<E>()
        .get('/api/todos', {
          scenarios: { empty: [] },
          fn: () => [{ id: 1, title: 'normal' }],
        })
        .done(),
    });

    expect(await (await fetch(`${server.url}/api/todos?_scenario=empty`)).json()).toEqual([]);
  });
});

describe('mockr({ groups })', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => {
    await server?.close();
  });

  it('flattens multiple groups into one server', async () => {
    const groupA = mockGroup<E>()
      .get('/api/todos', () => [{ id: 1, title: 'a' }])
      .done();
    const groupB = mockGroup<E>().data('/internal/todos', [{ id: 9, title: 'b' }]).done();

    server = await mockr({ groups: [groupA, groupB] });

    expect(await (await fetch(`${server.url}/api/todos`)).json()).toEqual([{ id: 1, title: 'a' }]);
    expect(await (await fetch(`${server.url}/internal/todos`)).json()).toEqual([{ id: 9, title: 'b' }]);
  });

  it('merges groups alongside endpoints', async () => {
    const g = mockGroup<E>().data('/internal/todos', [{ id: 2, title: 'g' }]).done();

    server = await mockr({
      endpoints: mockGroup<E>()
        .get('/api/todos', () => [{ id: 1, title: 'e' }])
        .done(),
      groups: [g],
    });

    expect(await (await fetch(`${server.url}/api/todos`)).json()).toEqual([{ id: 1, title: 'e' }]);
    expect(await (await fetch(`${server.url}/internal/todos`)).json()).toEqual([{ id: 2, title: 'g' }]);
  });
});
