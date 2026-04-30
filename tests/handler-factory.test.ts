import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { handler, isHandlerSpec, HANDLER_SPEC_BRAND } from '../src/handler.js';

describe('handler factory', () => {
  it('returns a value branded with HANDLER_SPEC_BRAND', () => {
    const spec = handler({
      fn: () => ({ status: 200, body: {} }),
    });

    expect((spec as Record<symbol, unknown>)[HANDLER_SPEC_BRAND]).toBe(true);
  });

  it('isHandlerSpec returns true for factory output', () => {
    const spec = handler({
      fn: () => ({ status: 200, body: {} }),
    });

    expect(isHandlerSpec(spec)).toBe(true);
  });

  it('isHandlerSpec returns false for a plain function', () => {
    const fn = (_req: unknown, _ctx: unknown) => ({ status: 200, body: {} });

    expect(isHandlerSpec(fn)).toBe(false);
  });

  it('isHandlerSpec returns false for an arbitrary object', () => {
    expect(isHandlerSpec({})).toBe(false);
    expect(isHandlerSpec({ fn: () => ({ status: 200, body: {} }) })).toBe(false);
  });

  it('isHandlerSpec returns false for null and primitives', () => {
    expect(isHandlerSpec(null)).toBe(false);
    expect(isHandlerSpec(undefined)).toBe(false);
    expect(isHandlerSpec(42)).toBe(false);
    expect(isHandlerSpec('string')).toBe(false);
  });

  it('preserves body, query, params, and fn slots on the returned object', () => {
    const bodySchema = z.object({ name: z.string() });
    const querySchema = z.object({ page: z.string() });
    const paramsSchema = z.object({ id: z.string() });
    const fn = () => ({ status: 200, body: {} });

    const spec = handler({
      body: bodySchema,
      query: querySchema,
      params: paramsSchema,
      fn,
    });

    expect(spec.body).toBe(bodySchema);
    expect(spec.query).toBe(querySchema);
    expect(spec.params).toBe(paramsSchema);
    expect(spec.fn).toBe(fn);
  });

  it('uses Symbol.for so the brand is shared across realms', () => {
    expect(HANDLER_SPEC_BRAND).toBe(Symbol.for('mockr.HandlerSpec'));
  });
});
