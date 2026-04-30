import { writeFile } from 'node:fs/promises';

/** Options accepted by `createListHandle`. */
export interface ListHandleOptions {
  /** Field name used as the id (defaults to `'id'`). */
  idKey?: string;
}

/**
 * Handle for a list (array) endpoint. Holds an array of records and exposes
 * the CRUD-style helpers used both by HTTP request handling and by user code
 * inside `handler({...})` and scenarios.
 */
export interface ListHandle<T> {
  /** Live, mutable backing array. Reads reflect inserts/updates/removes. */
  data: T[];
  /** Find the first item whose `idKey` field matches `id`. */
  findById(id: string | number): T | undefined;
  /** Filter by a partial-object filter (all keys must match) or a predicate. */
  where(filter: Partial<T>): T[];
  where(predicate: (item: T) => boolean): T[];
  /** First item, or `undefined` for an empty list. */
  first(): T | undefined;
  /** Number of items currently held. */
  count(): number;
  /** True when an item with `idKey === id` exists. */
  has(id: string | number): boolean;
  /** `max(id) + 1`, or `1` for an empty list. */
  nextId(): number;
  /** Append `item`. Returns the inserted record. */
  insert(item: T): T;
  /** Patch the item with the given id. Returns the updated item or `undefined`. */
  update(id: string | number, patch: Partial<T>): T | undefined;
  /**
   * Patch many items, optionally deriving the patch per item. Returns the list
   * of items that were updated (missing ids are skipped silently).
   */
  updateMany(ids: (string | number)[], patch: Partial<T> | ((item: T) => Partial<T>)): T[];
  /**
   * Apply only the non-undefined keys of `fields`, then layer `defaults`
   * unconditionally on top.
   */
  patch(id: string | number, fields: Partial<T>, defaults?: Partial<T>): T | undefined;
  /** Remove the item with the given id. Returns `true` if removed. */
  remove(id: string | number): boolean;
  /** Empty the list. */
  clear(): void;
  /** Restore the original data via deep copy. */
  reset(): void;
  /** Persist the current data as JSON to `path`. */
  save(path: string): Promise<void>;
  /**
   * Replace the entire data array AND the baseline used by `reset()`. Used by
   * the dataFile hot-reload path so subsequent `reset()` calls go to the new
   * file content rather than the original.
   */
  replaceData(items: readonly T[]): void;
}

/**
 * Build a `ListHandle` for an array endpoint. Stores a deep copy of `initial`
 * as the baseline used by `reset()`, and another deep copy as the live data —
 * so caller-side mutations of the source array never bleed into the handle.
 */
export function createListHandle<T>(
  initial: readonly T[],
  opts: ListHandleOptions = {},
): ListHandle<T> {
  const idKey = opts.idKey ?? 'id';
  const baseline = structuredClone(initial as T[]);
  let data: T[] = structuredClone(initial as T[]);

  function getId(item: T): unknown {
    return (item as Record<string, unknown>)[idKey];
  }

  function nextId(): number {
    if (data.length === 0) return 1;
    const ids = data.map((item) => {
      const val = getId(item);
      return typeof val === 'number' ? val : typeof val === 'string' ? parseInt(val, 10) || 0 : 0;
    });
    return Math.max(...ids) + 1;
  }

  function whereImpl(filterOrPredicate: Partial<T> | ((item: T) => boolean)): T[] {
    if (typeof filterOrPredicate === 'function') {
      return data.filter(filterOrPredicate);
    }
    const filter = filterOrPredicate as Partial<T>;
    return data.filter((item) =>
      Object.entries(filter).every(([key, val]) => (item as Record<string, unknown>)[key] === val),
    );
  }

  return {
    get data() {
      return data;
    },
    set data(value: T[]) {
      data = value;
    },

    findById(id) {
      // Use loose equality so '1' (path param) matches numeric ids.
      return data.find((item) => getId(item) == id);
    },

    where: whereImpl as ListHandle<T>['where'],

    first() {
      return data[0];
    },

    count() {
      return data.length;
    },

    has(id) {
      return data.some((item) => getId(item) == id);
    },

    nextId,

    insert(item) {
      const newItem = { ...(item as Record<string, unknown>) } as T;
      const id = (newItem as Record<string, unknown>)[idKey];
      if (id === undefined || id === null) {
        (newItem as Record<string, unknown>)[idKey] = nextId();
      }
      data.push(newItem);
      return newItem;
    },

    update(id, patch) {
      const item = data.find((i) => getId(i) == id);
      if (!item) return undefined;
      Object.assign(item as Record<string, unknown>, patch);
      return item;
    },

    updateMany(ids, patch) {
      const results: T[] = [];
      for (const id of ids) {
        const item = data.find((i) => getId(i) == id);
        if (!item) continue;
        const p = typeof patch === 'function' ? patch(item) : patch;
        Object.assign(item as Record<string, unknown>, p);
        results.push(item);
      }
      return results;
    },

    patch(id, fields, defaults) {
      const item = data.find((i) => getId(i) == id);
      if (!item) return undefined;
      for (const [key, val] of Object.entries(fields as Record<string, unknown>)) {
        if (val !== undefined) {
          (item as Record<string, unknown>)[key] = val;
        }
      }
      if (defaults) {
        Object.assign(item as Record<string, unknown>, defaults);
      }
      return item;
    },

    remove(id) {
      const idx = data.findIndex((i) => getId(i) == id);
      if (idx === -1) return false;
      data.splice(idx, 1);
      return true;
    },

    clear() {
      data.length = 0;
    },

    reset() {
      data = structuredClone(baseline);
    },

    async save(path: string) {
      await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
    },

    replaceData(items) {
      data = structuredClone(items as T[]);
      // Update baseline so a subsequent `reset()` goes to the new content,
      // not the original (matches dataFile hot-reload semantics).
      baseline.length = 0;
      baseline.push(...structuredClone(items as T[]));
    },
  };
}
