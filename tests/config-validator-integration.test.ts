import { describe, it, expect } from 'vitest';
import { mockr } from '../src/index.js';

describe('mockr boot validation', () => {
  it('throws on invalid config before binding port', async () => {
    await expect(
      mockr({
        port: 0,
        endpoints: [{ url: '/api/x', dataFiel: './x.json' } as any],
      }),
    ).rejects.toThrow(/'dataFiel' is not a known key/);
  });

  it('aggregates multiple errors in one throw', async () => {
    let err: Error | null = null;
    try {
      await mockr({
        port: 0,
        endpoints: [
          { url: '/api/x', dataFiel: './x.json' } as any,
          { url: '/api/y', data: [], handler: (() => ({ body: {} })) as any } as any,
        ],
      });
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeInstanceOf(Error);
    // 'dataFiel' typo (entry 0) + 'data + handler' conflict + 'raw function handler' (entry 1)
    expect(err!.message).toMatch(/3 endpoint definitions invalid/);
  });
});
