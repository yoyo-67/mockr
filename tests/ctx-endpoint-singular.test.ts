import { describe, it, expect, afterEach } from 'vitest';
import { mockr, handler } from '../src/index.js';

describe('ctx.endpoint (singular) — runtime', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => { await server?.close(); });

  it('handler reads cross-endpoint data via ctx.endpoint(url).data', async () => {
    const internalData = [
      { id: 1, name: 'Alpha' },
      { id: 2, name: 'Beta' },
    ];

    server = await mockr({
      endpoints: [
        { url: '/internal/x', data: internalData },
        {
          url: '/api/x',
          handler: handler({
            fn: (_req, ctx) => {
              const internal = ctx.endpoint('/internal/x');
              return { body: internal.data };
            },
          }),
        },
      ],
    });

    const res = await fetch(`${server.url}/api/x`).then(r => r.json());
    expect(res).toEqual(internalData);
  });

  it('handler mutates cross-endpoint via ctx.endpoint(url).insert(...) and change persists', async () => {
    server = await mockr({
      endpoints: [
        { url: '/internal/x', data: [{ id: 1, name: 'Alpha' }] as { id: number; name: string }[] },
        {
          url: '/api/x',
          method: 'POST',
          handler: handler({
            fn: (_req, ctx) => {
              const internal = ctx.endpoint('/internal/x');
              internal.insert({ id: 2, name: 'Beta' });
              return { body: { ok: true } };
            },
          }),
        },
      ],
    });

    // Trigger handler that performs cross-endpoint insert
    const post = await fetch(`${server.url}/api/x`, { method: 'POST' });
    expect(post.status).toBe(200);

    // Subsequent fetch of /internal/x reflects the inserted record
    const after = await fetch(`${server.url}/internal/x`).then(r => r.json());
    expect(after).toEqual([
      { id: 1, name: 'Alpha' },
      { id: 2, name: 'Beta' },
    ]);
  });
});
