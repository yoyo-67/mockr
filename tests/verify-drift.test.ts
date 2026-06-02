import { describe, it, expect, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { mockr } from '../src/index.js';
import { mockGroup } from '../src/mock-group.js';

type ThingEndpoints = {
  '/api/thing': { a: number };
};

describe('contract-drift verify', () => {
  let server: Awaited<ReturnType<typeof mockr<ThingEndpoints>>>;
  afterEach(async () => {
    await server?.close();
  });

  it('reports drift when the served body violates the responseSchema', async () => {
    const onDrift = vi.fn();
    server = await mockr({
      verify: true,
      onDrift,
      endpoints: mockGroup<ThingEndpoints>()
        .get('/api/thing', {
          // Contract requires `b`; the mock omits it → drift.
          responseSchema: z.object({ a: z.number(), b: z.number() }),
          fn: () => ({ a: 1 }),
        })
        .done(),
    });

    await fetch(`${server.url}/api/thing`);
    expect(onDrift).toHaveBeenCalledTimes(1);
    expect(onDrift).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/thing', method: 'GET' }));
  });

  it('does not report drift when the body satisfies the schema', async () => {
    const onDrift = vi.fn();
    server = await mockr({
      verify: true,
      onDrift,
      endpoints: mockGroup<ThingEndpoints>()
        .get('/api/thing', {
          responseSchema: z.object({ a: z.number() }),
          fn: () => ({ a: 1 }),
        })
        .done(),
    });

    await fetch(`${server.url}/api/thing`);
    expect(onDrift).not.toHaveBeenCalled();
  });

  it('skips the check entirely when verify is off', async () => {
    const onDrift = vi.fn();
    server = await mockr({
      onDrift,
      endpoints: mockGroup<ThingEndpoints>()
        .get('/api/thing', {
          responseSchema: z.object({ a: z.number(), b: z.number() }),
          fn: () => ({ a: 1 }),
        })
        .done(),
    });

    await fetch(`${server.url}/api/thing`);
    expect(onDrift).not.toHaveBeenCalled();
  });
});
