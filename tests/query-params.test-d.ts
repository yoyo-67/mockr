import { describe, it, expectTypeOf } from 'vitest';
import { z } from 'zod';
import { jsonParam, jsonArrayParam } from '../src/query-params.js';
import type { ParseableSchema } from '../src/types.js';

interface SizeRange {
  min: number;
  max: number;
}

const sizeRange = {} as ParseableSchema<SizeRange>;

describe('jsonParam types', () => {
  it('infers the output from a zod inner schema', () => {
    const schema = jsonParam(z.object({ a: z.number() }));
    expectTypeOf<z.infer<typeof schema>>().toEqualTypeOf<{ a: number }>();
  });

  it('infers the output from a hand-rolled ParseableSchema', () => {
    const schema = jsonParam(sizeRange);
    expectTypeOf<z.infer<typeof schema>>().toEqualTypeOf<SizeRange>();
  });

  it('is unknown when no inner schema is given', () => {
    const schema = jsonParam();
    expectTypeOf<z.infer<typeof schema>>().toEqualTypeOf<unknown>();
  });
});

describe('jsonArrayParam types', () => {
  it('infers an array of the inner type', () => {
    const schema = jsonArrayParam(sizeRange);
    expectTypeOf<z.infer<typeof schema>>().toEqualTypeOf<SizeRange[]>();
  });

  it('composes inside z.object as a query schema', () => {
    const query = z.object({ size: jsonArrayParam(sizeRange) });
    expectTypeOf<z.infer<typeof query>>().toEqualTypeOf<{ size: SizeRange[] }>();
  });
});
