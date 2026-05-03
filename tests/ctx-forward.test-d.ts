import { describe, it, expectTypeOf } from 'vitest';
import { handler } from '../src/handler.js';

describe('ctx.forward types', () => {
  it('returns body as unknown by default', () => {
    handler({
      fn: async (_req, ctx) => {
        const res = await ctx.forward();
        expectTypeOf(res.body).toEqualTypeOf<unknown>();
        expectTypeOf(res.status).toEqualTypeOf<number>();
        expectTypeOf(res.headers).toEqualTypeOf<Record<string, string | string[]>>();
        return { status: 200, body: {} };
      },
    });
  });

  it('returns body as T when generic is supplied', () => {
    interface User { id: number; name: string }
    handler({
      fn: async (_req, ctx) => {
        const res = await ctx.forward<User[]>();
        expectTypeOf(res.body).toEqualTypeOf<User[]>();
        expectTypeOf(res.body[0].id).toEqualTypeOf<number>();
        return { status: 200, body: res.body };
      },
    });
  });

  it('accepts an optional patch with path/method/headers/body', () => {
    handler({
      fn: async (_req, ctx) => {
        await ctx.forward({ path: '/v2/users' });
        await ctx.forward({ method: 'PUT' });
        await ctx.forward({ headers: { 'x-trace': 'abc' } });
        await ctx.forward({ body: { foo: 1 } });
        return { status: 200, body: {} };
      },
    });
  });
});
