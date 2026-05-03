import type { EndpointDef } from './types.js';

/**
 * Group helper for splitting mocks across files.
 *
 * Runtime is a no-op: it returns the input array unchanged.
 *
 * Type-level value: each item's `url` must exist in `T`, `data` must match
 * `T[url]`, and `ctx.endpoint(url)` inside group handlers is typed against
 * `T`. Top-level `mockr<E>({ endpoints: [...] })` keeps its explicit generic;
 * multiple groups compose via intersection:
 *
 * ```ts
 * type E = A & B;
 * await mockr<E>({ endpoints: [...aMocks, ...bMocks] });
 * ```
 */
export function endpoints<TEndpoints = Record<string, unknown>>(
  defs: ReadonlyArray<EndpointDef<TEndpoints>>,
): ReadonlyArray<EndpointDef<TEndpoints>> {
  return defs;
}
