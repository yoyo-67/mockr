/**
 * Handle for a record (single-object) endpoint. Holds one object and exposes
 * a small mutation API: `set` (merge), `replace` (overwrite), `reset` (restore
 * the initial value via deep copy).
 */
export interface RecordHandle<T extends object> {
  /** Current data. Mutations to nested fields are reflected here. */
  readonly data: T;
  /** Merge `patch` into the current data (shallow). */
  set(patch: Partial<T>): void;
  /** Overwrite the entire object with `value`. */
  replace(value: T): void;
  /** Restore a deep copy of the initial value. */
  reset(): void;
}

/**
 * Build a `RecordHandle` for a single-object endpoint. The handle owns its
 * own copy of `initial`, so later mutations of the caller's object do not
 * leak into the handle (and vice versa).
 */
export function createRecordHandle<T extends object>(initial: T): RecordHandle<T> {
  const baseline = structuredClone(initial);
  let current: T = structuredClone(initial);

  return {
    get data() {
      return current;
    },
    set(patch: Partial<T>) {
      Object.assign(current as object, patch);
    },
    replace(value: T) {
      current = value;
    },
    reset() {
      current = structuredClone(baseline);
    },
  };
}
