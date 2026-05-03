import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mockr, handler } from '../src/index.js';

interface Backend {
  url: string;
  close: () => Promise<void>;
  setResponse: (status: number, body: unknown, headers?: Record<string, string | string[]>) => void;
  setHandler: (fn: (req: IncomingMessage, body: string) => { status: number; body: unknown; headers?: Record<string, string | string[]> }) => void;
  lastRequest: () => { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; body: string } | null;
  hitCount: () => number;
}

function spawnBackend(): Promise<Backend> {
  let response: { status: number; body: unknown; headers: Record<string, string | string[]> } = {
    status: 200,
    body: { ok: true },
    headers: { 'Content-Type': 'application/json' },
  };
  let custom: ((req: IncomingMessage, body: string) => { status: number; body: unknown; headers?: Record<string, string | string[]> }) | null = null;
  let last: { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; body: string } | null = null;
  let hits = 0;

  const httpServer: HttpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    hits++;
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const bodyStr = Buffer.concat(chunks).toString('utf-8');
      last = { method: req.method, url: req.url, headers: req.headers, body: bodyStr };
      const out = custom ? { headers: { 'Content-Type': 'application/json' }, ...custom(req, bodyStr) } : response;
      const headers = out.headers ?? { 'Content-Type': 'application/json' };
      res.writeHead(out.status, headers);
      res.end(typeof out.body === 'string' ? out.body : JSON.stringify(out.body));
    });
  });

  return new Promise((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      if (!addr || typeof addr === 'string') throw new Error('no address');
      resolve({
        url: `http://localhost:${addr.port}`,
        close: () => new Promise<void>((r, rj) => httpServer.close((e) => (e ? rj(e) : r()))),
        setResponse: (status, body, headers) => {
          response = { status, body, headers: headers ?? { 'Content-Type': 'application/json' } };
          custom = null;
        },
        setHandler: (fn) => { custom = fn; },
        lastRequest: () => last,
        hitCount: () => hits,
      });
    });
  });
}

describe('ctx.forward()', () => {
  const open: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (open.length) {
      const s = open.pop()!;
      try { await s.close(); } catch { /* already closed */ }
    }
  });

  it('forwards the request to the proxy target and returns mutated body to the client', async () => {
    const backend = await spawnBackend();
    open.push(backend);
    backend.setResponse(200, { users: [
      { id: 1, name: 'Alice', active: true },
      { id: 2, name: 'Bob', active: false },
      { id: 3, name: 'Carol', active: true },
    ]});

    const server = await mockr({
      proxy: { target: backend.url },
      endpoints: [
        {
          url: '/api/users',
          handler: handler({
            fn: async (_req, ctx) => {
              const res = await ctx.forward();
              const body = res.body as { users: { id: number; name: string; active: boolean }[] };
              body.users = body.users.filter((u) => u.active);
              return res;
            },
          }),
        },
      ],
    });
    open.push(server);

    const res = await fetch(`${server.url}/api/users`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.users).toEqual([
      { id: 1, name: 'Alice', active: true },
      { id: 3, name: 'Carol', active: true },
    ]);
  });

  it('forwards method, path with query, body, and headers verbatim by default', async () => {
    const backend = await spawnBackend();
    open.push(backend);

    const server = await mockr({
      proxy: { target: backend.url },
      endpoints: [
        {
          url: '/api/orders',
          handler: handler({
            fn: async (_req, ctx) => ctx.forward(),
          }),
        },
      ],
    });
    open.push(server);

    await fetch(`${server.url}/api/orders?status=open&page=2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Trace': 'abc' },
      body: JSON.stringify({ user_id: 'u1', total: 99 }),
    });

    const last = backend.lastRequest()!;
    expect(last.method).toBe('POST');
    expect(last.url).toBe('/api/orders?status=open&page=2');
    expect(last.headers['x-trace']).toBe('abc');
    expect(JSON.parse(last.body)).toEqual({ user_id: 'u1', total: 99 });
  });

  it('overrides upstream path via patch.path', async () => {
    const backend = await spawnBackend();
    open.push(backend);

    const server = await mockr({
      proxy: { target: backend.url },
      endpoints: [
        {
          url: '/api/users',
          handler: handler({
            fn: async (_req, ctx) => ctx.forward({ path: '/v2/users?source=mockr' }),
          }),
        },
      ],
    });
    open.push(server);

    await fetch(`${server.url}/api/users`);
    expect(backend.lastRequest()!.url).toBe('/v2/users?source=mockr');
  });

  it('overrides upstream method via patch.method', async () => {
    const backend = await spawnBackend();
    open.push(backend);

    const server = await mockr({
      proxy: { target: backend.url },
      endpoints: [
        {
          url: '/api/orders',
          handler: handler({
            fn: async (_req, ctx) => ctx.forward({ method: 'PUT', body: { x: 1 } }),
          }),
        },
      ],
    });
    open.push(server);

    await fetch(`${server.url}/api/orders`, { method: 'POST' });
    const last = backend.lastRequest()!;
    expect(last.method).toBe('PUT');
    expect(JSON.parse(last.body)).toEqual({ x: 1 });
  });

  it('overrides upstream body via patch.body', async () => {
    const backend = await spawnBackend();
    open.push(backend);

    const server = await mockr({
      proxy: { target: backend.url },
      endpoints: [
        {
          url: '/api/orders',
          handler: handler({
            fn: async (req, ctx) => {
              const enriched = { ...(req.body as object), internal_flag: true };
              return ctx.forward({ body: enriched });
            },
          }),
        },
      ],
    });
    open.push(server);

    await fetch(`${server.url}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: 'u1' }),
    });
    expect(JSON.parse(backend.lastRequest()!.body)).toEqual({
      user_id: 'u1',
      internal_flag: true,
    });
  });

  it('overrides upstream headers via patch.headers (e.g. strip authorization)', async () => {
    const backend = await spawnBackend();
    open.push(backend);

    const server = await mockr({
      proxy: { target: backend.url },
      endpoints: [
        {
          url: '/api/me',
          handler: handler({
            fn: async (req, ctx) => {
              const { authorization, ...rest } = req.headers;
              void authorization;
              return ctx.forward({ headers: rest });
            },
          }),
        },
      ],
    });
    open.push(server);

    await fetch(`${server.url}/api/me`, {
      headers: { Authorization: 'Bearer secret', 'X-Other': 'kept' },
    });
    const last = backend.lastRequest()!;
    expect(last.headers.authorization).toBeUndefined();
    expect(last.headers['x-other']).toBe('kept');
  });

  it('throws when proxy.target is not configured', async () => {
    const server = await mockr({
      endpoints: [
        {
          url: '/api/x',
          handler: handler({
            fn: async (_req, ctx) => {
              try {
                await ctx.forward();
                return { status: 500, body: { error: 'should have thrown' } };
              } catch (e) {
                return { status: 500, body: { error: String((e as Error).message) } };
              }
            },
          }),
        },
      ],
    });
    open.push(server);

    const res = await fetch(`${server.url}/api/x`);
    const json = await res.json();
    expect(json.error).toMatch(/proxy\.target/);
  });

  it('strips Domain and Secure from upstream Set-Cookie (same as proxy mode)', async () => {
    const backend = await spawnBackend();
    open.push(backend);
    backend.setResponse(200, { ok: true }, {
      'Content-Type': 'application/json',
      'Set-Cookie': ['session=abc; Domain=example.com; Path=/; Secure; HttpOnly'],
    });

    const server = await mockr({
      proxy: { target: backend.url },
      endpoints: [
        {
          url: '/api/login',
          handler: handler({
            fn: async (_req, ctx) => ctx.forward(),
          }),
        },
      ],
    });
    open.push(server);

    const res = await fetch(`${server.url}/api/login`);
    const [cookie] = res.headers.getSetCookie();
    expect(cookie).toContain('session=abc');
    expect(cookie).not.toMatch(/Domain=/i);
    expect(cookie).not.toMatch(/;\s*Secure(?:;|$)/i);
    expect(cookie).toContain('HttpOnly');
  });

  it('mem-session record: GET upstream response cached in active record session', async () => {
    const backend = await spawnBackend();
    open.push(backend);
    backend.setResponse(200, { users: [{ id: 1, name: 'Alice' }] });

    const server = await mockr({
      proxy: { target: backend.url },
      endpoints: [
        {
          url: '/api/users',
          handler: handler({
            fn: async (_req, ctx) => {
              const res = await ctx.forward();
              const body = res.body as { users: { id: number; name: string }[] };
              body.users = body.users.map((u) => ({ ...u, name: u.name.toUpperCase() }));
              return res;
            },
          }),
        },
      ],
    });
    open.push(server);

    const sess = server.sessions.create('rec');
    server.sessions.activate(sess.id, 'record');

    const res = await fetch(`${server.url}/api/users`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.users[0].name).toBe('ALICE');

    // Cached entry holds upstream pre-mutation body — mutation lives only in handler.
    const stored = server.sessions.get(sess.id)!;
    expect(stored.entries).toHaveLength(1);
    expect(stored.entries[0].body).toEqual({ users: [{ id: 1, name: 'Alice' }] });
  });

  it('mem-session replay: cached upstream served without re-fetching, mutation re-runs', async () => {
    const backend = await spawnBackend();
    open.push(backend);
    backend.setResponse(200, { users: [{ id: 1, name: 'Alice' }] });

    const server = await mockr({
      proxy: { target: backend.url },
      endpoints: [
        {
          url: '/api/users',
          handler: handler({
            fn: async (_req, ctx) => {
              const res = await ctx.forward();
              const body = res.body as { users: { id: number; name: string }[] };
              body.users = body.users.map((u) => ({ ...u, name: u.name.toUpperCase() }));
              return res;
            },
          }),
        },
      ],
    });
    open.push(server);

    // Record once.
    const sess = server.sessions.create('rec');
    server.sessions.activate(sess.id, 'record');
    await fetch(`${server.url}/api/users`);
    const hitsAfterRecord = backend.hitCount();
    expect(hitsAfterRecord).toBe(1);

    // Switch to replay; backend MUST NOT receive a second hit.
    server.sessions.activate(sess.id, 'replay');
    const r2 = await fetch(`${server.url}/api/users`);
    const json = await r2.json();
    expect(backend.hitCount()).toBe(1);              // no new upstream call
    expect(json.users[0].name).toBe('ALICE');         // mutation still applied
  });

  it('logs request line with `fwd` tag when handler used ctx.forward()', async () => {
    const backend = await spawnBackend();
    open.push(backend);

    const server = await mockr({
      proxy: { target: backend.url },
      endpoints: [
        {
          url: '/api/x',
          handler: handler({ fn: async (_req, ctx) => ctx.forward() }),
        },
      ],
    });
    open.push(server);

    const captured: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => { captured.push(args.map(String).join(' ')); };
    try {
      await fetch(`${server.url}/api/x`);
    } finally {
      console.log = orig;
    }

    const reqLine = captured.find((l) => l.includes('/api/x'));
    expect(reqLine).toBeDefined();
    expect(reqLine).toMatch(/\bfwd\b/);
  });

  it('logs `mock` tag when handler did not call ctx.forward()', async () => {
    const backend = await spawnBackend();
    open.push(backend);

    const server = await mockr({
      proxy: { target: backend.url },
      endpoints: [
        {
          url: '/api/y',
          handler: handler({ fn: () => ({ status: 200, body: { local: true } }) }),
        },
      ],
    });
    open.push(server);

    const captured: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => { captured.push(args.map(String).join(' ')); };
    try {
      await fetch(`${server.url}/api/y`);
    } finally {
      console.log = orig;
    }

    const reqLine = captured.find((l) => l.includes('/api/y'));
    expect(reqLine).toBeDefined();
    expect(reqLine).toMatch(/\bmock\b/);
    expect(reqLine).not.toMatch(/\bfwd\b/);
  });
});
