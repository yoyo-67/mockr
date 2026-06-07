import { afterEach } from 'vitest';
import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'node:http';

/** A throwaway upstream server for proxy/forward tests. */
export interface FakeBackend {
  url: string;
  close: () => Promise<void>;
  /** Set the JSON body (and optional status) returned for every request. */
  setResponse: (body: unknown, status?: number) => void;
  /** Total requests received. */
  hits: () => number;
  /** Paths (`req.url`) received, in order — for asserting what was forwarded where. */
  paths: () => string[];
}

/** Spawn a fake upstream backend on a random port. Returns once it's listening. */
export function spawnBackend(initial: unknown = []): Promise<FakeBackend> {
  let body: unknown = initial;
  let status = 200;
  let hits = 0;
  const seen: string[] = [];
  const httpServer: HttpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    hits++;
    seen.push(req.url ?? '');
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
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
        setResponse: (b, s) => { body = b; if (s !== undefined) status = s; },
        hits: () => hits,
        paths: () => seen,
      });
    });
  });
}

/**
 * Register an `afterEach` that closes everything tracked during a test. Call at
 * the top of a `describe`; `track(server)` / `track(backend)` anything closeable
 * and it's torn down automatically (LIFO, errors swallowed).
 */
export function trackClose(): <T extends { close: () => Promise<void> }>(closeable: T) => T {
  const open: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (open.length) {
      try { await open.pop()!.close(); } catch { /* already closed */ }
    }
  });
  return (closeable) => { open.push(closeable); return closeable; };
}

/** Shorthand for a JSON POST. */
export function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

/** GET + parse JSON in one step. */
export async function getJson(url: string): Promise<unknown> {
  return (await fetch(url)).json();
}
