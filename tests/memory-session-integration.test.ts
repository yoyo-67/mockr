import { describe, it, expect, afterEach } from 'vitest';
import { mockr } from '../src/index.js';

type Server = Awaited<ReturnType<typeof mockr>>;

describe('Memory-session replay (integration)', () => {
  const openServers: Server[] = [];

  async function spawn(config: Parameters<typeof mockr>[0]): Promise<Server> {
    const s = await mockr(config);
    openServers.push(s);
    return s;
  }

  afterEach(async () => {
    while (openServers.length) {
      const s = openServers.pop()!;
      try { await s.close(); } catch { /* already closed */ }
    }
  });

  it('record mode: proxied responses are cached in the active session', async () => {
    let backendCalls = 0;
    const backend = await spawn({
      endpoints: [
        {
          url: '/api/users',
          handler: () => {
            backendCalls++;
            return { body: [{ id: 1, name: 'Alice' }] };
          },
        },
      ],
    });

    const server = await spawn({ proxy: { target: backend.url } });
    const s = server.sessions.create('landing');
    server.sessions.activate(s.id, 'record');

    const res = await fetch(`${server.url}/api/users`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 1, name: 'Alice' }]);
    expect(backendCalls).toBe(1);

    const inspected = server.sessions.get(s.id);
    expect(inspected?.entries).toHaveLength(1);
    expect(inspected?.entries[0].body).toEqual([{ id: 1, name: 'Alice' }]);
  });

  it('replay mode: cache hit serves without calling the backend', async () => {
    let backendCalls = 0;
    const backend = await spawn({
      endpoints: [
        {
          url: '/api/users',
          handler: () => {
            backendCalls++;
            return { body: [{ id: 1 }] };
          },
        },
      ],
    });

    const server = await spawn({ proxy: { target: backend.url } });
    const s = server.sessions.create('x');

    server.sessions.activate(s.id, 'record');
    await fetch(`${server.url}/api/users`);
    expect(backendCalls).toBe(1);

    server.sessions.activate(s.id, 'replay');
    const res = await fetch(`${server.url}/api/users`);
    expect(await res.json()).toEqual([{ id: 1 }]);
    expect(backendCalls).toBe(1); // still 1, served from cache
  });

  it('replay mode: cache miss falls through to proxy', async () => {
    let backendCalls = 0;
    const backend = await spawn({
      endpoints: [
        { url: '/api/users', handler: () => { backendCalls++; return { body: [] }; } },
        { url: '/api/orders', handler: () => { backendCalls++; return { body: { total: 7 } }; } },
      ],
    });

    const server = await spawn({ proxy: { target: backend.url } });
    const s = server.sessions.create('x');

    server.sessions.activate(s.id, 'record');
    await fetch(`${server.url}/api/users`);
    expect(backendCalls).toBe(1);

    server.sessions.activate(s.id, 'replay');
    const res = await fetch(`${server.url}/api/orders`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ total: 7 });
    expect(backendCalls).toBe(2);
  });

  it('replay mode serves cached responses after backend goes down', async () => {
    const backend = await spawn({
      endpoints: [{ url: '/api/data', data: { value: 42 } }],
    });

    const server = await spawn({ proxy: { target: backend.url } });
    const s = server.sessions.create('offline');

    server.sessions.activate(s.id, 'record');
    await fetch(`${server.url}/api/data`);

    server.sessions.activate(s.id, 'replay');
    await backend.close();
    // Pop from openServers since we closed it manually
    openServers.splice(openServers.indexOf(backend), 1);

    const res = await fetch(`${server.url}/api/data`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: 42 });
  });

  it('normalizes query string so param order does not affect cache hits', async () => {
    let backendCalls = 0;
    const backend = await spawn({
      endpoints: [
        {
          url: '/api/search',
          handler: () => {
            backendCalls++;
            return { body: { results: ['x'] } };
          },
        },
      ],
    });

    const server = await spawn({ proxy: { target: backend.url } });
    const s = server.sessions.create('x');

    server.sessions.activate(s.id, 'record');
    await fetch(`${server.url}/api/search?limit=10&sort=name`);
    expect(backendCalls).toBe(1);

    server.sessions.activate(s.id, 'replay');
    const res = await fetch(`${server.url}/api/search?sort=name&limit=10`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: ['x'] });
    expect(backendCalls).toBe(1);
  });

  it('deactivate returns to normal: cache is ignored afterwards', async () => {
    let backendCalls = 0;
    const backend = await spawn({
      endpoints: [
        {
          url: '/api/data',
          handler: () => { backendCalls++; return { body: { n: backendCalls } }; },
        },
      ],
    });

    const server = await spawn({ proxy: { target: backend.url } });
    const s = server.sessions.create('x');

    server.sessions.activate(s.id, 'record');
    const first = await (await fetch(`${server.url}/api/data`)).json();
    expect(first).toEqual({ n: 1 });

    server.sessions.deactivate();
    const second = await (await fetch(`${server.url}/api/data`)).json();
    expect(second).toEqual({ n: 2 }); // fresh proxy call, cache ignored
    expect(backendCalls).toBe(2);
  });

  it('defined mockr endpoints take precedence over session cache', async () => {
    let backendCalls = 0;
    const backend = await spawn({
      endpoints: [
        {
          url: '/api/data',
          handler: () => { backendCalls++; return { body: { from: 'backend' } }; },
        },
      ],
    });

    // First server caches from backend
    const recorder = await spawn({ proxy: { target: backend.url } });
    const s1 = recorder.sessions.create('x');
    recorder.sessions.activate(s1.id, 'record');
    await fetch(`${recorder.url}/api/data`);

    // Second server defines /api/data as a static endpoint; session replay must not override it
    const server = await spawn({
      endpoints: [{ url: '/api/data', data: { from: 'mock' } }],
      proxy: { target: backend.url },
    });
    const s2 = server.sessions.create('x');
    server.sessions.activate(s2.id, 'record');

    const res = await fetch(`${server.url}/api/data`);
    const body = await res.json();
    expect(body).toEqual({ from: 'mock' });
    // Endpoint wins → nothing recorded in session
    expect(server.sessions.get(s2.id)?.entries).toHaveLength(0);
  });

  it('switching to a different session isolates caches', async () => {
    let backendCalls = 0;
    const backend = await spawn({
      endpoints: [
        { url: '/api/users', handler: () => { backendCalls++; return { body: [{ id: 1 }] }; } },
      ],
    });

    const server = await spawn({ proxy: { target: backend.url } });
    const s1 = server.sessions.create('one');
    const s2 = server.sessions.create('two');

    server.sessions.activate(s1.id, 'record');
    await fetch(`${server.url}/api/users`);
    expect(backendCalls).toBe(1);

    server.sessions.activate(s2.id, 'replay');
    await fetch(`${server.url}/api/users`);
    // s2 has no cached response → falls through to proxy
    expect(backendCalls).toBe(2);
  });

  it('exposes mem-session HTTP control routes', async () => {
    const server = await spawn({});

    const createRes = await fetch(`${server.url}/__mockr/mem-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'http-test' }),
    });
    const created = await createRes.json();
    expect(created.name).toBe('http-test');
    expect(created.id).toBeTruthy();

    const listRes = await fetch(`${server.url}/__mockr/mem-sessions`);
    const list = await listRes.json();
    expect(list.sessions).toHaveLength(1);
    expect(list.active).toBeNull();

    const activateRes = await fetch(`${server.url}/__mockr/mem-sessions/${created.id}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'record' }),
    });
    expect(activateRes.status).toBe(200);
    expect((await activateRes.json()).active.mode).toBe('record');

    const deactivateRes = await fetch(`${server.url}/__mockr/mem-sessions/deactivate`, { method: 'POST' });
    expect(deactivateRes.status).toBe(200);

    const deleteRes = await fetch(`${server.url}/__mockr/mem-sessions/${created.id}`, { method: 'DELETE' });
    expect(deleteRes.status).toBe(200);
  });
});
