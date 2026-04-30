import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { mockr } from '../src/index.js';

interface Backend {
  url: string;
  close: () => Promise<void>;
  lastCookie: () => string | undefined;
  setCookies: (cookies: string[]) => void;
  setExtraHeaders: (headers: Record<string, string>) => void;
}

function spawnBackend(): Promise<Backend> {
  let cookies: string[] = [];
  let extra: Record<string, string> = {};
  let lastCookieHeader: string | undefined;

  const httpServer: HttpServer = createServer((req, res) => {
    lastCookieHeader = req.headers.cookie;
    const headers: Record<string, string | string[]> = { 'Content-Type': 'application/json', ...extra };
    if (cookies.length) headers['Set-Cookie'] = cookies;
    res.writeHead(200, headers);
    res.end(JSON.stringify({ ok: true, cookie: lastCookieHeader ?? null }));
  });

  return new Promise((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      if (!addr || typeof addr === 'string') throw new Error('no address');
      resolve({
        url: `http://localhost:${addr.port}`,
        close: () => new Promise<void>((r, rj) => httpServer.close((e) => (e ? rj(e) : r()))),
        lastCookie: () => lastCookieHeader,
        setCookies: (c) => { cookies = c; },
        setExtraHeaders: (h) => { extra = h; },
      });
    });
  });
}

describe('Proxy cookie forwarding', () => {
  const open: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (open.length) {
      const s = open.pop()!;
      try { await s.close(); } catch { /* already closed */ }
    }
  });

  it('forwards multiple Set-Cookie headers from the upstream as separate headers', async () => {
    const backend = await spawnBackend();
    open.push(backend);
    backend.setCookies([
      'csrftoken=abc123; Path=/; Expires=Sat, 01-Jan-2030 00:00:00 GMT',
      'sessionid=xyz789; Path=/; HttpOnly',
    ]);

    const server = await mockr({ proxy: { target: backend.url } });
    open.push(server);

    const res = await fetch(`${server.url}/api/whoami`);
    expect(res.status).toBe(200);

    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    expect(setCookies[0]).toContain('csrftoken=abc123');
    // Comma in Expires must not have been split — full date should survive.
    expect(setCookies[0]).toContain('Expires=Sat, 01-Jan-2030 00:00:00 GMT');
    expect(setCookies[1]).toContain('sessionid=xyz789');
    expect(setCookies[1]).toContain('HttpOnly');
  });

  it('strips Domain and Secure attributes so cookies stick on localhost', async () => {
    const backend = await spawnBackend();
    open.push(backend);
    backend.setCookies(['csrftoken=abc; Domain=example.com; Path=/; Secure']);

    const server = await mockr({ proxy: { target: backend.url } });
    open.push(server);

    const res = await fetch(`${server.url}/api/whoami`);
    const [cookie] = res.headers.getSetCookie();
    expect(cookie).toContain('csrftoken=abc');
    expect(cookie).not.toMatch(/Domain=/i);
    expect(cookie).not.toMatch(/;\s*Secure(?:;|$)/i);
  });

  it('forwards the browser Cookie header to the upstream', async () => {
    const backend = await spawnBackend();
    open.push(backend);

    const server = await mockr({ proxy: { target: backend.url } });
    open.push(server);

    const res = await fetch(`${server.url}/api/whoami`, {
      headers: { Cookie: 'csrftoken=abc; sessionid=xyz' },
    });
    const json = await res.json();
    expect(json.cookie).toBe('csrftoken=abc; sessionid=xyz');
    expect(backend.lastCookie()).toBe('csrftoken=abc; sessionid=xyz');
  });

  it('does not corrupt cookies when no Set-Cookie is present', async () => {
    const backend = await spawnBackend();
    open.push(backend);
    backend.setExtraHeaders({ 'X-Custom': 'value' });

    const server = await mockr({ proxy: { target: backend.url } });
    open.push(server);

    const res = await fetch(`${server.url}/api/whoami`);
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(res.headers.get('x-custom')).toBe('value');
  });
});
