import { writeFile } from 'node:fs/promises';
import type { MockrRequest, EndpointHandle, HandlerContext, HandlerResult } from './types.js';

export function createEndpointHandle(initialData: unknown[], url: string, idKey: string = 'id'): EndpointHandle {
  const initial = structuredClone(initialData);
  let data = structuredClone(initialData) as Record<string, unknown>[];
  let staticBody: unknown = undefined;
  let staticResponse: { status: number; headers: Record<string, string>; body: unknown } = {
    status: 200,
    headers: {},
    body: undefined,
  };
  let handlerFn: ((req: MockrRequest, ctx: HandlerContext<any>) => HandlerResult | Promise<HandlerResult>) | null = null;

  function nextId(): number {
    if (data.length === 0) return 1;
    const ids = data.map((item) => {
      const val = item[idKey];
      return typeof val === 'number' ? val : typeof val === 'string' ? parseInt(val, 10) || 0 : 0;
    });
    return Math.max(...ids) + 1;
  }

  const handle: EndpointHandle = {
    get data() {
      return data;
    },
    set data(value: Record<string, unknown>[]) {
      data = value;
    },

    findById(id: string | number) {
      return data.find((item) => item[idKey] == id);
    },

    where(filterOrPredicate: Partial<Record<string, unknown>> | ((item: Record<string, unknown>) => boolean)): Record<string, unknown>[] {
      if (typeof filterOrPredicate === 'function') {
        return data.filter(filterOrPredicate);
      }
      const filter = filterOrPredicate;
      return data.filter((item) =>
        Object.entries(filter).every(([key, val]) => item[key] === val)
      );
    },

    first() {
      return data[0];
    },

    count() {
      return data.length;
    },

    has(id: string | number) {
      return data.some((item) => item[idKey] == id);
    },

    nextId,

    insert(item: Record<string, unknown>) {
      const newItem = { ...item };
      data.push(newItem);
      return newItem;
    },

    update(id: string | number, patch: Partial<Record<string, unknown>>) {
      const item = data.find((i) => i[idKey] == id);
      if (!item) return undefined;
      Object.assign(item, patch);
      return item;
    },

    updateMany(ids: (string | number)[], patch: Partial<Record<string, unknown>> | ((item: Record<string, unknown>) => Partial<Record<string, unknown>>)) {
      const results: Record<string, unknown>[] = [];
      for (const id of ids) {
        const item = data.find((i) => i[idKey] == id);
        if (!item) continue;
        const p = typeof patch === 'function' ? patch(item) : patch;
        Object.assign(item, p);
        results.push(item);
      }
      return results;
    },

    patch(id: string | number, fields: Partial<Record<string, unknown>>, defaults?: Partial<Record<string, unknown>>) {
      const item = data.find((i) => i[idKey] == id);
      if (!item) return undefined;
      // Only apply fields that are not undefined
      for (const [key, val] of Object.entries(fields)) {
        if (val !== undefined) {
          item[key] = val;
        }
      }
      // Apply defaults unconditionally
      if (defaults) {
        Object.assign(item, defaults);
      }
      return item;
    },

    remove(id: string | number) {
      const idx = data.findIndex((i) => i[idKey] == id);
      if (idx === -1) return false;
      data.splice(idx, 1);
      return true;
    },

    clear() {
      data.length = 0;
    },

    reset() {
      data = structuredClone(initial) as Record<string, unknown>[];
    },

    async save(path: string) {
      await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
    },

    get body() {
      return staticBody;
    },
    set body(value: unknown) {
      staticBody = value;
    },

    get response() {
      return staticResponse;
    },
    set response(value: { status: number; headers: Record<string, string>; body: unknown }) {
      staticResponse = value;
    },

    get handler() {
      return handlerFn;
    },
    set handler(value: ((req: MockrRequest, ctx: HandlerContext<any>) => HandlerResult | Promise<HandlerResult>) | null) {
      handlerFn = value;
    },
  };

  return handle;
}
