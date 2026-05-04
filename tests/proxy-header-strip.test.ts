import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server as HttpServer, type IncomingHttpHeaders } from 'node:http';
import { mockr } from '../src/index.js';

interface Backend {
  url: string;
  close: () => Promise<void>;
  lastHeaders: () => IncomingHttpHeaders;
}

function spawnBackend(): Promise<Backend> {
  let captured: IncomingHttpHeaders = {};
  const httpServer: HttpServer = createServer((req, res) => {
    captured = req.headers;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  return new Promise((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      if (!addr || typeof addr === 'string') throw new Error('no address');
      resolve({
        url: `http://localhost:${addr.port}`,
        close: () => new Promise<void>((r, rj) => httpServer.close((e) => (e ? rj(e) : r()))),
        lastHeaders: () => captured,
      });
    });
  });
}

describe('Proxy header stripping', () => {
  const open: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (open.length) {
      const s = open.pop()!;
      try { await s.close(); } catch { /* already closed */ }
    }
  });

  it('strips x-forwarded-* / forwarded / via / x-real-ip injected by upstream dev-server', async () => {
    const backend = await spawnBackend();
    open.push(backend);

    const server = await mockr({ proxy: { target: backend.url } });
    open.push(server);

    const res = await fetch(`${server.url}/api/whoami`, {
      headers: {
        'X-Forwarded-For': '::1',
        'X-Forwarded-Host': 'localhost:3000',
        'X-Forwarded-Port': '3000',
        'X-Forwarded-Proto': 'http',
        'X-Forwarded-Server': 'dev',
        'X-Real-IP': '127.0.0.1',
        'Forwarded': 'for=127.0.0.1;proto=http',
        'Via': '1.1 vite-dev-server',
        'Referer': 'http://localhost:3000/p/foo?bar=1',
        'X-Custom': 'should-pass',
      },
    });
    expect(res.status).toBe(200);

    const h = backend.lastHeaders();
    expect(h['x-forwarded-for']).toBeUndefined();
    expect(h['x-forwarded-host']).toBeUndefined();
    expect(h['x-forwarded-port']).toBeUndefined();
    expect(h['x-forwarded-proto']).toBeUndefined();
    expect(h['x-forwarded-server']).toBeUndefined();
    expect(h['x-real-ip']).toBeUndefined();
    expect(h['forwarded']).toBeUndefined();
    expect(h['via']).toBeUndefined();
    // referer rewritten (not stripped) — must NOT be the leaked localhost value.
    expect(h['referer']).not.toContain('localhost:3000');
    // Non-hop headers must still pass through.
    expect(h['x-custom']).toBe('should-pass');
  });

  it('rewrites Origin + Referer to upstream so CSRF/origin checks pass', async () => {
    const backend = await spawnBackend();
    open.push(backend);
    const backendOrigin = backend.url;

    const server = await mockr({ proxy: { target: backend.url } });
    open.push(server);

    await fetch(`${server.url}/api/csrf-protected`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000',
        'Referer': 'http://localhost:3000/some/page?x=1',
      },
      body: JSON.stringify({ ok: true }),
    });
    const h = backend.lastHeaders();
    expect(h['origin']).toBe(backendOrigin);
    expect(h['referer']).toBe(`${backendOrigin}/api/csrf-protected`);
  });

  it('rewrites host to upstream so request looks direct, not proxied', async () => {
    const backend = await spawnBackend();
    open.push(backend);
    const backendHost = new URL(backend.url).host;

    const server = await mockr({ proxy: { target: backend.url } });
    open.push(server);

    await fetch(`${server.url}/api/whoami`);
    const h = backend.lastHeaders();
    expect(h.host).toBe(backendHost);
  });
});
