import { describe, it, expect, afterEach } from 'vitest';
import { z } from 'zod';
import { mockr } from '../src/index.js';
import { mockGroup } from '../src/mock-group.js';
import { jsonParam, jsonArrayParam } from '../src/query-params.js';
import type { ParseableSchema } from '../src/types.js';

interface SizeRange {
  min: number;
  max: number;
}

// Hand-rolled (zod-free) inner validator — proves jsonParam's inner is any ParseableSchema.
const sizeRange: ParseableSchema<SizeRange> = {
  safeParse(value: unknown) {
    if (value !== null && typeof value === 'object' && typeof (value as { min?: unknown }).min === 'number') {
      const max = typeof (value as { max?: unknown }).max === 'number' ? (value as SizeRange).max : Number.MAX_SAFE_INTEGER;
      return { success: true, data: { min: (value as SizeRange).min, max } };
    }
    return { success: false, error: { message: 'not a size range' } };
  },
};

describe('jsonParam', () => {
  it('parses a JSON string and validates with the inner schema', () => {
    const schema = jsonParam(z.object({ a: z.number() }));
    expect(schema.safeParse('{"a":1}')).toMatchObject({ success: true, data: { a: 1 } });
  });

  it('fails on invalid JSON', () => {
    const schema = jsonParam(z.object({ a: z.number() }));
    expect(schema.safeParse('not json').success).toBe(false);
  });

  it('fails when parsed JSON does not match the inner schema', () => {
    const schema = jsonParam(z.object({ a: z.number() }));
    expect(schema.safeParse('{"a":"x"}').success).toBe(false);
  });

  it('returns the parsed value when no inner schema is given', () => {
    const schema = jsonParam();
    expect(schema.safeParse('{"a":1}')).toMatchObject({ success: true, data: { a: 1 } });
  });

  it('accepts a hand-rolled (zod-free) inner validator', () => {
    const schema = jsonParam(sizeRange);
    expect(schema.safeParse('{"min":1}')).toMatchObject({ success: true, data: { min: 1, max: Number.MAX_SAFE_INTEGER } });
  });
});

describe('jsonArrayParam', () => {
  it('parses a single string value into a one-element array', () => {
    const schema = jsonArrayParam(sizeRange);
    expect(schema.safeParse('{"min":1,"max":5}')).toMatchObject({ success: true, data: [{ min: 1, max: 5 }] });
  });

  it('parses repeated values (string[])', () => {
    const schema = jsonArrayParam(sizeRange);
    const result = schema.safeParse(['{"min":1,"max":5}', '{"min":6,"max":9}']);
    expect(result).toMatchObject({ success: true, data: [{ min: 1, max: 5 }, { min: 6, max: 9 }] });
  });

  it('skips malformed entries instead of failing', () => {
    const schema = jsonArrayParam(sizeRange);
    const result = schema.safeParse(['{"min":1,"max":5}', 'garbage', '{"nope":true}']);
    expect(result).toMatchObject({ success: true, data: [{ min: 1, max: 5 }] });
  });

  it('returns [] when the value is absent', () => {
    const schema = jsonArrayParam(sizeRange);
    expect(schema.safeParse(undefined)).toMatchObject({ success: true, data: [] });
  });
});

describe('jsonArrayParam — as a mockGroup query schema', () => {
  type SizesEndpoints = {
    '/api/sizes': { ranges: SizeRange[] };
  };

  let server: Awaited<ReturnType<typeof mockr<SizesEndpoints>>>;
  afterEach(async () => {
    await server?.close();
  });

  it('threads parsed + filtered ranges into req.query', async () => {
    server = await mockr({
      endpoints: mockGroup<SizesEndpoints>()
        .get('/api/sizes', {
          query: z.object({ size: jsonArrayParam(sizeRange) }),
          fn: (req) => ({ ranges: req.query.size }),
        })
        .done(),
    });

    const url = `${server.url}/api/sizes?size=${encodeURIComponent('{"min":1,"max":5}')}&size=garbage`;
    const res = await fetch(url);
    expect(await res.json()).toEqual({ ranges: [{ min: 1, max: 5 }] });
  });
});
