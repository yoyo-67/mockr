import { describe, it, expect } from 'vitest';
import { mockr, mockGroup } from '../src/index.js';
import { spawnBackend, trackClose, getJson, postJson } from './test-utils.js';

interface Todo { id: number; title: string }

describe('.data(url, loaderFn) — run once, then own', () => {
  const track = trackClose();

  it('runs the loader once on first GET, then default CRUD serves + owns the store', async () => {
    const backend = track(await spawnBackend([{ id: 1, title: 'milk' }]));

    const server = track(await mockr<{ '/api/todos': Todo[] }>({
      proxy: { target: backend.url },
      endpoints: mockGroup<{ '/api/todos': Todo[] }>()
        .data('/api/todos', async (_req, ctx) => (await ctx.forward<Todo[]>()).body)
        .done(),
    }));

    expect(await getJson(`${server.url}/api/todos`)).toEqual([{ id: 1, title: 'milk' }]);
    await postJson(`${server.url}/api/todos`, { title: 'eggs' });
    expect(await getJson(`${server.url}/api/todos`)).toEqual([
      { id: 1, title: 'milk' },
      { id: 2, title: 'eggs' },
    ]);
    expect(backend.hits()).toBe(1); // loader ran exactly once
  });

  it('partitions a param URL — each :projectId seeds independently, no bleed', async () => {
    interface Thing { id: number; project: string }
    const server = track(await mockr<{ '/projects/:projectId/things': Thing[] }>({
      endpoints: mockGroup<{ '/projects/:projectId/things': Thing[] }>()
        // loader returns project-specific data, so partitions are distinguishable
        .data('/projects/:projectId/things', (req) => [{ id: 1, project: req.params.projectId }])
        .done(),
    }));

    expect(await getJson(`${server.url}/projects/A/things`)).toEqual([{ id: 1, project: 'A' }]);

    // mutate A
    await postJson(`${server.url}/projects/A/things`, { id: 2, project: 'A' });

    // B seeds fresh from its own loader run — unaffected by A's POST
    expect(await getJson(`${server.url}/projects/B/things`)).toEqual([{ id: 1, project: 'B' }]);

    // A still holds its own mutation
    expect(await getJson(`${server.url}/projects/A/things`)).toEqual([
      { id: 1, project: 'A' },
      { id: 2, project: 'A' },
    ]);
  });

  it('cross-endpoint write via ctx.endpoint hits the current request partition', async () => {
    interface Thing { id: number; project: string }
    type E = {
      '/projects/:projectId/things': Thing[];
      '/projects/:projectId/things/create': { ok: true };
    };
    const server = track(await mockr<E>({
      endpoints: mockGroup<E>()
        .data('/projects/:projectId/things', (req) => [{ id: 1, project: req.params.projectId }])
        .post('/projects/:projectId/things/create', (req, ctx) => {
          ctx.endpoint('/projects/:projectId/things').insert({ id: 2, project: req.params.projectId });
          return ctx.created({ ok: true });
        })
        .done(),
    }));

    // seed A via GET, then create on the *other* URL for project A
    expect(await getJson(`${server.url}/projects/A/things`)).toEqual([{ id: 1, project: 'A' }]);
    await postJson(`${server.url}/projects/A/things/create`, {});

    // A's collection reflects the cross-endpoint insert
    expect(await getJson(`${server.url}/projects/A/things`)).toEqual([
      { id: 1, project: 'A' },
      { id: 2, project: 'A' },
    ]);
    // B is its own partition — untouched
    expect(await getJson(`${server.url}/projects/B/things`)).toEqual([{ id: 1, project: 'B' }]);
  });

  it('static param seed is cloned per partition (no shared mutation)', async () => {
    interface Thing { id: number; title: string }
    const server = track(await mockr<{ '/projects/:projectId/things': Thing[] }>({
      endpoints: mockGroup<{ '/projects/:projectId/things': Thing[] }>()
        .data('/projects/:projectId/things', [{ id: 1, title: 'seed' }])
        .done(),
    }));

    await postJson(`${server.url}/projects/A/things`, { id: 2, title: 'a-only' });
    expect(await getJson(`${server.url}/projects/A/things`)).toEqual([{ id: 1, title: 'seed' }, { id: 2, title: 'a-only' }]);
    expect(await getJson(`${server.url}/projects/B/things`)).toEqual([{ id: 1, title: 'seed' }]); // fresh clone
  });

  it('record-shaped loader: serves the object, cross-endpoint write mutates it', async () => {
    interface Resp { companies: { id: string }[] }
    type E = {
      '/projects/:projectId/companies': Resp;
      '/projects/:projectId/companies-create': { ok: true };
    };
    const server = track(await mockr<E>({
      endpoints: mockGroup<E>()
        .data('/projects/:projectId/companies', () => ({ companies: [{ id: 'a' }] }))
        .post('/projects/:projectId/companies-create', (_req, ctx) => {
          (ctx.endpoint('/projects/:projectId/companies').data as Resp).companies.push({ id: 'b' });
          return ctx.created({ ok: true });
        })
        .done(),
    }));

    expect(await getJson(`${server.url}/projects/X/companies`)).toEqual({ companies: [{ id: 'a' }] });
    await postJson(`${server.url}/projects/X/companies-create`, {});
    expect(await getJson(`${server.url}/projects/X/companies`)).toEqual({ companies: [{ id: 'a' }, { id: 'b' }] });
  });

  it('throws when a cross-endpoint write cannot resolve the partition param', async () => {
    type E = { '/projects/:projectId/things': { id: number }[]; '/admin/bump': { ok: true } };
    const server = track(await mockr<E>({
      endpoints: mockGroup<E>()
        .data('/projects/:projectId/things', () => [{ id: 1 }])
        .post('/admin/bump', (_req, ctx) => {
          ctx.endpoint('/projects/:projectId/things').insert({ id: 9 }); // no :projectId in /admin/bump
          return ctx.created({ ok: true });
        })
        .done(),
    }));

    expect((await postJson(`${server.url}/admin/bump`, {})).status).toBeGreaterThanOrEqual(500);
  });

  it('server.endpoint(url).reset() re-arms every partition', async () => {
    let n = 0;
    const server = track(await mockr<{ '/projects/:projectId/things': { id: number }[] }>({
      endpoints: mockGroup<{ '/projects/:projectId/things': { id: number }[] }>()
        .data('/projects/:projectId/things', () => [{ id: ++n }])
        .done(),
    }));

    await getJson(`${server.url}/projects/A/things`);              // seeds A → [{id:1}]
    await postJson(`${server.url}/projects/A/things`, { id: 99 }); // mutate A
    server.endpoint('/projects/:projectId/things').reset();        // re-arm all partitions

    // A re-seeds on next read (loader runs again → next id), mutation gone
    expect(await getJson(`${server.url}/projects/A/things`)).toEqual([{ id: 2 }]);
  });

  it('concurrent first GETs run the loader exactly once', async () => {
    const backend = track(await spawnBackend([{ id: 1, title: 'milk' }]));
    const server = track(await mockr<{ '/api/todos': Todo[] }>({
      proxy: { target: backend.url },
      endpoints: mockGroup<{ '/api/todos': Todo[] }>()
        .data('/api/todos', async (_req, ctx) => (await ctx.forward<Todo[]>()).body)
        .done(),
    }));

    await Promise.all([
      fetch(`${server.url}/api/todos`),
      fetch(`${server.url}/api/todos`),
      fetch(`${server.url}/api/todos`),
    ]);
    expect(backend.hits()).toBe(1); // in-flight guard collapses the race
  });

  it('a loader failure does not latch — the next GET retries', async () => {
    let attempt = 0;
    const server = track(await mockr<{ '/api/x': Todo[] }>({
      endpoints: mockGroup<{ '/api/x': Todo[] }>()
        .data('/api/x', () => {
          attempt++;
          if (attempt === 1) throw new Error('upstream down');
          return [{ id: 1, title: 'recovered' }];
        })
        .done(),
    }));

    expect((await fetch(`${server.url}/api/x`)).status).toBeGreaterThanOrEqual(500);
    expect(await getJson(`${server.url}/api/x`)).toEqual([{ id: 1, title: 'recovered' }]);
    expect(attempt).toBe(2);
  });
});
