import { createListHandle, type ListHandle, type ListHandleOptions } from './list-handle.js';
import { createRecordHandle, type RecordHandle } from './record-handle.js';

/**
 * Conditional handle type. Picks `ListHandle` when `T` is an array, and
 * `RecordHandle` when `T` is a non-array object. Anything else is `never`.
 */
export type EndpointHandle<T> =
  T extends readonly (infer U)[]
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
