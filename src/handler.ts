import type { ParseableSchema, MockrRequest, HandlerResult, HandlerContext } from './types.js';

/**
 * Brand symbol applied to every value returned from `handler({...})`.
 * Uses `Symbol.for` so the brand is shared across realms and module instances.
 */
export const HANDLER_SPEC_BRAND: unique symbol = Symbol.for('mockr.HandlerSpec') as never;

/**
 * Spec object produced by the `handler({...})` factory. Carries the optional
 * schemas to validate `body`, `query`, and `params` against, plus the `fn` to
 * run when the request is received.
 *
 * The `[HANDLER_SPEC_BRAND]: true` field lets runtime code distinguish a spec
 * (factory output) from a plain handler function or an arbitrary object.
 */
export interface HandlerSpec<
  TBody extends ParseableSchema | undefined = undefined,
  TQuery extends ParseableSchema | undefined = undefined,
  TParams extends ParseableSchema | undefined = undefined,
  TEndpoints = Record<string, unknown>,
> {
  readonly [HANDLER_SPEC_BRAND]: true;
  body?: TBody;
  query?: TQuery;
  params?: TParams;
  // Bivariant param checking via method shorthand — lets a handler typed for a
  // group's `T` flow into a wider `T'` at a `mockr<T'>` call site (groups
  // composed by intersection).
  fn: {
    bivarianceHack(
      req: MockrRequest<{
        body: TBody extends ParseableSchema<infer B> ? B : unknown;
        params: TParams extends ParseableSchema<infer P extends Record<string, string>> ? P : Record<string, string>;
        query: TQuery extends ParseableSchema<infer Q extends Record<string, unknown>> ? Q : Record<string, string | string[]>;
      }>,
      ctx: HandlerContext<TEndpoints>,
    ): HandlerResult | Promise<HandlerResult>;
  }['bivarianceHack'];
}

/**
 * Input shape accepted by `handler({...})` — the same as `HandlerSpec` minus
 * the brand, which the factory adds.
 */
type HandlerSpecInput<
  TBody extends ParseableSchema | undefined,
  TQuery extends ParseableSchema | undefined,
  TParams extends ParseableSchema | undefined,
  TEndpoints,
> = Omit<HandlerSpec<TBody, TQuery, TParams, TEndpoints>, typeof HANDLER_SPEC_BRAND>;

/**
 * Factory that builds a branded `HandlerSpec` from validation schemas and a
 * handler function. Schema-bearing slots flow through to `fn`'s `req` so
 * `req.body` / `req.query` / `req.params` are typed as the schemas' outputs.
 */
export function handler<
  TBody extends ParseableSchema | undefined = undefined,
  TQuery extends ParseableSchema | undefined = undefined,
  TParams extends ParseableSchema | undefined = undefined,
  TEndpoints = Record<string, unknown>,
>(
  spec: HandlerSpecInput<TBody, TQuery, TParams, TEndpoints>,
): HandlerSpec<TBody, TQuery, TParams, TEndpoints> {
  return {
    ...spec,
    [HANDLER_SPEC_BRAND]: true,
  };
}

/**
 * Type guard that returns true iff `value` is the output of `handler({...})`.
 * Plain functions and unbranded objects return false.
 */
export function isHandlerSpec(value: unknown): value is HandlerSpec {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[HANDLER_SPEC_BRAND] === true
  );
}
