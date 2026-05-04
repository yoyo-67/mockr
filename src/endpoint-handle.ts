import { createListHandle, type ListHandle, type ListHandleOptions } from './list-handle.js';
import { createRecordHandle, type RecordHandle } from './record-handle.js';
import type { WsEndpoint, WsHandle } from './ws.js';

/**
 * Superset of every shape `EndpointHandle` can produce. Used as the fallback
 * when the caller does not pass an `Endpoints` generic and `T` collapses to
 * `unknown`. The intersection makes list, record, and ws method surfaces
 * structurally accessible so untyped consumers can still call `.data`,
 * `.findById`, `.count`, `.set`, `.broadcast`, etc. without narrowing.
 */
export type AnyEndpointHandle = ListHandle<unknown> & RecordHandle<Record<string, unknown>> & WsHandle<unknown>;

/**
 * Conditional handle type. Picks the right handle shape based on `T`:
 * - `WsEndpoint<Out, In>` → `WsHandle<Out>`
 * - array → `ListHandle<U>`
 * - non-array object → `RecordHandle<T>`
 *
 * The `unknown extends T` check (with `unknown` on the LEFT) only matches
 * when `T` is exactly `unknown`, so untyped callers fall back to the union
 * `AnyEndpointHandle`. Typed callers (`WsEndpoint<...>`, `Foo[]`, `{ x: 1 }`)
 * bypass the check and reach the precise narrowed branches below.
 */
export type EndpointHandle<T = unknown> =
  unknown extends T
    ? AnyEndpointHandle
    : T extends WsEndpoint<infer O, any>
      ? WsHandle<O>
      : T extends readonly (infer U)[]
        ? ListHandle<U>
        : T extends object
          ? RecordHandle<T>
          : never;

/** Options accepted by `createEndpointHandle`. */
export type EndpointHandleOptions = ListHandleOptions;

/**
 * Build the right kind of handle for `initial`:
 * - arrays return a `ListHandle<U>` (CRUD over records),
 * - objects return a `RecordHandle<T>` (set/replace/reset).
 *
 * The runtime check uses `Array.isArray`. The return type is the conditional
 * `EndpointHandle<T>`.
 */
export function createEndpointHandle<T extends readonly unknown[] | object>(
  initial: T,
  opts: EndpointHandleOptions = {},
): EndpointHandle<T> {
  if (Array.isArray(initial)) {
    return createListHandle(initial, opts) as EndpointHandle<T>;
  }
  return createRecordHandle(initial as object) as EndpointHandle<T>;
}
