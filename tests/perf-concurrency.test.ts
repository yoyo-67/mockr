import { describe, it, expect, afterEach } from 'vitest';
import { mockr } from '../src/index.js';

type Server = Awaited<ReturnType<typeof mockr>>;

describe('Server concurrency', () => {
  const open: Server[] = [];

  async function spawn(config: Parameters<typeof mockr>[0]): Promise<Server> {
    const s = await mockr(config);
    open.push(s);
    return s;
  }

  afterEach(async () => {
    while (open.length) {
      const s = open.pop()!;
      try { await s.close(); } catch { /* already closed */ }
    }
  });

  it('handler requests overlap instead of serializing', async () => {
    const server = await spawn({
      endpoints: [
        {
          url: '/slow',
          handler: async () => {
            await new Promise((r) => setTimeout(r, 100));
            return { body: { ok: true } };
          },
        },
      ],
    });

    const start = performance.now();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => fetch(`${server.url}/slow`)),
    );
    const elapsed = performance.now() - start;

    expect(results.every((r) => r.status === 200)).toBe(true);
    // Serial would be ≥1000ms; parallel should finish well under 300ms
    expect(elapsed).toBeLessThan(300);
  });

  it('replay serves many concurrent cached requests fast', async () => {
    let backendCalls = 0;
    const backend = await spawn({
      endpoints: [
        {
          url: '/api/data',
          handler: () => {
            backendCalls++;
            return { body: { v: 1 } };
          },
        },
      ],
    });

    const server = await spawn({ proxy: { target: backend.url } });
    const s = server.sessions.create('perf');

    server.sessions.activate(s.id, 'record');
    await fetch(`${server.url}/api/data`);
    expect(backendCalls).toBe(1);

    server.sessions.activate(s.id, 'replay');

    const start = performance.now();
    const results = await Promise.all(
      Array.from({ length: 50 }, () => fetch(`${server.url}/api/data`)),
    );
    const elapsed = performance.now() - start;

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(elapsed).toBeLessThan(100);
    // Zero extra backend calls — everything came from the cache
    expect(backendCalls).toBe(1);
  });

  it('proxy requests overlap instead of serializing', async () => {
    const backend = await spawn({
      endpoints: [
        {
          url: '/slow',
          handler: async () => {
            await new Promise((r) => setTimeout(r, 100));
            return { body: { ok: true } };
          },
        },
      ],
    });

    const server = await spawn({ proxy: { target: backend.url } });

    const start = performance.now();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => fetch(`${server.url}/slow`)),
    );
    const elapsed = performance.now() - start;

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(elapsed).toBeLessThan(300);
  });
});
