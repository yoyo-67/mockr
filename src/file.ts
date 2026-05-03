/**
 * Brand symbol applied to every value returned from `file()`.
 * Uses `Symbol.for` so the brand is shared across realms and module instances.
 */
export const FILE_REF_BRAND: unique symbol = Symbol.for('mockr.FileRef') as never;

/**
 * Branded reference to a JSON data file produced by `file<T>('./path')`.
 *
 * At runtime `FileRef` carries the input path on `.path`. At the type level
 * the phantom `__type` field carries `T` so consumers (e.g. `EndpointDef`'s
 * `dataFile` slot) can flow `T` through to `EndpointHandle<T>` without
 * requiring a static `import x from './x.json'` (which would defeat
 * hot-reload of the underlying JSON file).
 *
 * The `[FILE_REF_BRAND]: true` field lets runtime code distinguish a file
 * ref from a plain path string or arbitrary object.
 */
export interface FileRef<T = unknown> {
  readonly [FILE_REF_BRAND]: true;
  readonly path: string;
  /**
   * Phantom field — exists only at the type level so TypeScript can carry
   * `T` through generic inference. Never read at runtime.
   */
  readonly __type?: T;
}

/**
 * Factory that builds a branded `FileRef<T>` from a JSON file path. The
 * generic `T` is preserved at the type level so `dataFile: file<Foo[]>(...)`
 * unlocks `ListHandle<Foo>` on the resulting endpoint handle.
 */
export function file<T = unknown>(path: string): FileRef<T> {
  return {
    [FILE_REF_BRAND]: true,
    path,
  };
}

/**
 * Type guard that returns true iff `value` is the output of `file(...)`.
 * Plain strings and unbranded objects return false.
 */
export function isFileRef(value: unknown): value is FileRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[FILE_REF_BRAND] === true
  );
}

/**
 * Extract the underlying path string from a `FileRef`. Mirror of `.path`,
 * provided as a function so call sites can be uniform with `isFileRef`.
 */
export function getFilePath(ref: FileRef): string {
  return ref.path;
}
