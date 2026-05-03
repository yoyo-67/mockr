import { describe, it, expectTypeOf } from 'vitest';
import { z } from 'zod';
import { handler, type HandlerSpec } from '../src/handler.js';

describe('handler factory types', () => {
  it('infers req.body from body schema', () => {
    handler({
      body: z.object({ name: z.string(), price: z.number() }),
      fn: (req) => {
        expectTypeOf(req.body.name).toEqualTypeOf<string>();
        expectTypeOf(req.body.price).toEqualTypeOf<number>();
        return { status: 200, body: req.body };
      },
    });
  });

  it('infers req.query from query schema', () => {
    handler({
      query: z.object({ page: z.string(), limit: z.string().optional() }),
      fn: (req) => {
        expectTypeOf(req.query.page).toEqualTypeOf<string>();
        expectTypeOf(req.query.limit).toEqualTypeOf<string | undefined>();
        return { status: 200, body: {} };
      },
    });
  });

  it('infers req.params from params schema', () => {
    handler({
      params: z.object({ id: z.string(), kind: z.string() }),
      fn: (req) => {
        expectTypeOf(req.params.id).toEqualTypeOf<string>();
        expectTypeOf(req.params.kind).toEqualTypeOf<string>();
        return { status: 200, body: {} };
      },
    });
  });

  it('keeps defaults when no schemas are provided', () => {
    handler({
      fn: (req) => {
        expectTypeOf(req.body).toEqualTypeOf<unknown>();
        expectTypeOf(req.query).toEqualTypeOf<Record<string, string | string[]>>();
        expectTypeOf(req.params).toEqualTypeOf<Record<string, string>>();
        return { status: 200, body: {} };
      },
    });
  });

  it('plain function is not assignable to a HandlerSpec slot', () => {
    const plain = (_req: unknown, _ctx: unknown) => ({ status: 200, body: {} });

    // @ts-expect-error plain function is not a HandlerSpec
    const spec: HandlerSpec = plain;
    spec;
  });

  it('arbitrary object is not assignable to a HandlerSpec slot', () => {
    // @ts-expect-error missing fn and brand
    const spec: HandlerSpec = { foo: 1 };
    spec;
  });
});
