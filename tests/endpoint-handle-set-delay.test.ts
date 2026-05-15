import { describe, it, expect, afterEach } from 'vitest';
import { mockr, handler } from '../src/index.js';

describe('handle.setDelay() — runtime per-route delay control', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => { await server?.close(); });

  it('sets a delay on a data endpoint at runtime', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/users', data: [{ id: 1 }] },
      ],
    });

    // Baseline: no delay set
    const startBaseline = Date.now();
    const baseline = await fetch(`${server.url}/api/users`);
    expect(Date.now() - startBaseline).toBeLessThan(50);
    expect(baseline.headers.get('x-mockr-delay')).toBeNull();

    // Set delay at runtime
    server.endpoint('/api/users').setDelay(60);

    const startDelayed = Date.now();
    const delayed = await fetch(`${server.url}/api/users`);
    expect(Date.now() - startDelayed).toBeGreaterThanOrEqual(40);
    expect(delayed.headers.get('x-mockr-delay')).toBe('60');
  });

  it('clears delay via setDelay(null)', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/users', data: [{ id: 1 }], delay: 100 },
      ],
    });

    server.endpoint('/api/users').setDelay(null);

    const start = Date.now();
    const res = await fetch(`${server.url}/api/users`);
    expect(Date.now() - start).toBeLessThan(50);
    expect(res.headers.get('x-mockr-delay')).toBeNull();
  });

  it('accepts {min, max} window', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/users', data: [{ id: 1 }] },
      ],
    });

    server.endpoint('/api/users').setDelay({ min: 40, max: 80 });

    const res = await fetch(`${server.url}/api/users`);
    const headerVal = Number(res.headers.get('x-mockr-delay'));
    expect(headerVal).toBeGreaterThanOrEqual(40);
    expect(headerVal).toBeLessThanOrEqual(80);
  });

  it('works on record-shaped endpoint', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/config', data: { theme: 'dark' } },
      ],
    });

    server.endpoint('/api/config').setDelay(60);

    const start = Date.now();
    const res = await fetch(`${server.url}/api/config`);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    expect(res.headers.get('x-mockr-delay')).toBe('60');
  });

  it('works on handler endpoint via server.endpoint()', async () => {
    // Handler endpoints don't have a data handle; setDelay should still work.
    server = await mockr({
      endpoints: [
        {
          url: '/api/compute',
          handler: handler({ fn: () => ({ body: { ok: true } }) }),
        },
      ],
    });

    // Handler-only endpoints throw on `endpoint(url)` today — see line 369 in server.ts.
    // setDelay needs to be reachable some other way. We expose it via a small
    // control surface keyed by endpoint URL.
    expect(() => server.setEndpointDelay('/api/compute', 60)).not.toThrow();

    const start = Date.now();
    const res = await fetch(`${server.url}/api/compute`);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    expect(res.headers.get('x-mockr-delay')).toBe('60');
  });

  it('throws on negative number', async () => {
    server = await mockr({
      endpoints: [{ url: '/api/users', data: [{ id: 1 }] }],
    });
    expect(() => server.endpoint('/api/users').setDelay(-50)).toThrow(/>= 0/);
  });

  it('throws on NaN', async () => {
    server = await mockr({
      endpoints: [{ url: '/api/users', data: [{ id: 1 }] }],
    });
    expect(() => server.endpoint('/api/users').setDelay(NaN)).toThrow(/finite/);
  });

  it('throws on min > max', async () => {
    server = await mockr({
      endpoints: [{ url: '/api/users', data: [{ id: 1 }] }],
    });
    expect(() =>
      server.endpoint('/api/users').setDelay({ min: 500, max: 100 }),
    ).toThrow(/delay\.min .* delay\.max/);
  });
});
