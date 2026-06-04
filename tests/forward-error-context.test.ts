import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mockr, handler } from '../src/index.js';

// Minimal upstream that always answers with a configurable status + body.
function spawnBackend(status: number, body: unknown): Promise<{ url: string; close: () => Promise<void> }> {
  const httpServer: HttpServer = createServer((_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  return new Promise((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      if (!addr || typeof addr === 'string') throw new Error('no address');
      resolve({
        url: `http://localhost:${addr.port}`,
        close: () => new Promise<void>((r, rj) => httpServer.close((e) => (e ? rj(e) : r()))),
      });
    });
  });
}

describe('handler-throw error context', () => {
  const open: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (open.length) {
      const s = open.pop()!;
      try { await s.close(); } catch { /* already closed */ }
    }
  });

  it('enriches the 500 with method, path, forward status, and a hint when forward returned non-2xx', async () => {
    // Upstream 404 returns an error object, not the array the handler expects.
    const backend = await spawnBackend(404, { detail: 'Not found' });
    open.push(backend);

    const server = await mockr({
      proxy: { target: backend.url },
      endpoints: [
        {
          url: '/api/v1/projects/:id/activities',
          handler: handler({
            fn: async (_req, ctx) => {
              const { body } = await ctx.forward({ path: '/api/v1/projects/123/activities/' });
              // Mirrors the user's serverMocker.ts:56 — assumes an array body.
              return { status: 200, body: (body as unknown[]).map((x) => x) };
            },
          }),
        },
      ],
    });
    open.push(server);

    const res = await fetch(`${server.url}/api/v1/projects/123/activities`);
    expect(res.status).toBe(500);
    const json = await res.json();

    // Identifies the request that failed.
    expect(json.method).toBe('GET');
    expect(json.path).toBe('/api/v1/projects/123/activities');
    // Surfaces the forward that returned a bad status.
    expect(json.forward).toMatchObject({ path: '/api/v1/projects/123/activities/', status: 404 });
    // Points at the likely cause.
    expect(json.hint).toMatch(/404/);
    expect(json.hint).toMatch(/forward/i);
    // Original message preserved.
    expect(json.error).toMatch(/map/);
    expect(typeof json.stack).toBe('string');
  });

  it('enriches the 500 with method/path even when no forward was used', async () => {
    const server = await mockr({
      endpoints: [
        {
          url: '/api/boom',
          handler: handler({
            fn: async () => {
              throw new Error('kaboom');
            },
          }),
        },
      ],
    });
    open.push(server);

    const res = await fetch(`${server.url}/api/boom`);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.method).toBe('GET');
    expect(json.path).toBe('/api/boom');
    expect(json.error).toMatch(/kaboom/);
    expect(json.forward).toBeUndefined();
    expect(json.hint).toBeUndefined();
  });

  it('reports an unreachable upstream for plain proxy passthrough (no ctx.forward)', async () => {
    // No handler — request falls through to plain proxy. Upstream is dead.
    const server = await mockr({
      proxy: { target: 'http://localhost:1' },
      endpoints: [],
    });
    open.push(server);

    const res = await fetch(`${server.url}/api/passthrough`);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.method).toBe('GET');
    expect(json.path).toBe('/api/passthrough');
    expect(json.error).toMatch(/proxy/i);
    expect(json.error).toMatch(/localhost:1/);
  });

  it('reports an unreachable proxy target with the target url', async () => {
    // Point at a port nothing is listening on.
    const server = await mockr({
      proxy: { target: 'http://localhost:1' },
      endpoints: [
        {
          url: '/api/x',
          handler: handler({
            fn: async (_req, ctx) => {
              try {
                return await ctx.forward();
              } catch (e) {
                return { status: 599, body: { error: (e as Error).message } };
              }
            },
          }),
        },
      ],
    });
    open.push(server);

    const res = await fetch(`${server.url}/api/x`);
    const json = await res.json();
    expect(json.error).toMatch(/forward/i);
    expect(json.error).toMatch(/localhost:1/);
  });
});
