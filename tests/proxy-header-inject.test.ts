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

describe('proxy.headers injection (fill-if-absent)', () => {
  const open: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (open.length) {
      const s = open.pop()!;
      try { await s.close(); } catch { /* already closed */ }
    }
  });

  it('injects a configured header upstream when the request lacks it', async () => {
    const backend = await spawnBackend();
    open.push(backend);

    const server = await mockr({ proxy: { target: backend.url, headers: { Cookie: 'session=abc' } } });
    open.push(server);

    await fetch(`${server.url}/api/whoami`);

    expect(backend.lastHeaders()['cookie']).toBe('session=abc');
  });

  it('does NOT override a header the request already sent (request wins)', async () => {
    const backend = await spawnBackend();
    open.push(backend);

    const server = await mockr({ proxy: { target: backend.url, headers: { Cookie: 'session=abc' } } });
    open.push(server);

    await fetch(`${server.url}/api/whoami`, { headers: { Cookie: 'session=real-browser' } });

    expect(backend.lastHeaders()['cookie']).toBe('session=real-browser');
  });

  it('is case-insensitive when deciding presence', async () => {
    const backend = await spawnBackend();
    open.push(backend);

    const server = await mockr({ proxy: { target: backend.url, headers: { 'X-Auth': 'cfg' } } });
    open.push(server);

    await fetch(`${server.url}/api/whoami`, { headers: { 'x-auth': 'from-request' } });

    expect(backend.lastHeaders()['x-auth']).toBe('from-request');
  });
});
