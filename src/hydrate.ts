import type { HandlerContext, MockrRequest } from './types.js';

/**
 * Brand marking a loader as "hydrate once and own". A `data` endpoint whose
 * loader carries this brand runs the loader a single time on first access,
 * sets the result into the store, then serves + mutates the store locally
 * (default CRUD sticks). An unwrapped loader runs every request (live).
 */
export const HYDRATE_BRAND: unique symbol = Symbol.for('mockr.hydrate');

/** Loader run to fill a hydrated store. Full `HandlerContext` — incl. `forward`. */
export type HydrateFn<T> = (req: MockrRequest, ctx: HandlerContext<any>) => T | Promise<T>;

/** A loader wrapped by {@link hydrate} — run-once-and-own. */
export interface HydrateLoader<T> {
  readonly [HYDRATE_BRAND]: true;
  readonly loader: HydrateFn<T>;
}

/**
 * Wrap a loader so the endpoint fetches once, fills its store, and owns the
 * result (local CRUD mutations stick over the snapshot). Without it, a loader
 * runs every request (live). Proxy-agnostic — the loader may `ctx.forward()`,
 * read a file, or return inline data.
 */
export function hydrate<T>(loader: HydrateFn<T>): HydrateLoader<T> {
  return { [HYDRATE_BRAND]: true, loader };
}

/** True when `value` was produced by {@link hydrate}. */
export function isHydrate(value: unknown): value is HydrateLoader<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[HYDRATE_BRAND] === true
  );
}
