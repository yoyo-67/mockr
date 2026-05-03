# Mock-writing API Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship mockr v0.3.0 with redesigned mock-writing API that a junior FE dev can grok in 5 minutes.

**Architecture:** Collapse five endpoint forms into three (`data` / `dataFile` / `handler`) plus a `methods` overlay. Single `data` field works for both list (`T[]`) and record (`T`) endpoints; shape decides handle behavior via TS conditional. `handler({...})` is always a factory call (no raw shorthand). Multi-method endpoints use a single entry with a `methods` map. Add boot-time config validation, hot-reload for `dataFile`, declarative scenarios, and `endpoints<T>()` / `file<T>()` helpers for grouping and typed data files.

**Tech Stack:** TypeScript 5.7+, vitest, Node fs.watch, zod (peer), path-to-regexp.

**Spec:** [`docs/superpowers/specs/2026-04-30-mock-writing-api-redesign-design.md`](../specs/2026-04-30-mock-writing-api-redesign-design.md)

**File map:**
- New: `src/list-handle.ts`, `src/record-handle.ts`, `src/data-file-watcher.ts`, `src/scenarios.ts`, `src/config-validator.ts`, `src/handler.ts` (factory + brand)
- Heavy modify: `src/types.ts`, `src/server.ts`, `src/index.ts`
- Light modify: `src/control-routes.ts`, `src/recorder.ts`, `src/server-file-patcher.ts`, `src/router.ts`, `examples/**`, `playground/server.ts`, `README.md`
- Delete: `src/endpoint-handle.ts` (replaced by list-handle + record-handle)
- Test: `tests/list-handle.test.ts`, `tests/record-handle.test.ts`, `tests/config-validator.test.ts`, `tests/data-file-watcher.test.ts`, `tests/scenarios.test.ts`, `tests/handler-factory.test.ts`, `tests/api-redesign.test-d.ts`, plus updates to all existing level-* tests.

**Test runner:** `npm test` (vitest run + typecheck). For single file: `npx vitest run tests/foo.test.ts`. For type tests: `npx vitest run --config vitest.typecheck.config.ts tests/foo.test-d.ts`.

**Branch:** Work on a worktree off `main`. Commits per task.

---

## Phase 1 — Foundation helpers (no breaking changes yet)

### Task 1: Brand the `handler({...})` factory result

**Why:** Boot-time validation must reject `handler: rawFunction`. A nominal brand on the factory return value lets the validator distinguish factory output from a plain function at runtime.

**Files:**
- Create: `src/handler.ts`
- Modify: `src/index.ts:43-50` (move `handler` export from `index.ts` to `handler.ts`)
- Test: `tests/handler-factory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/handler-factory.test.ts
import { describe, it, expect } from 'vitest';
import { handler, isHandlerSpec } from '../src/handler.js';

describe('handler factory', () => {
  it('returns a branded HandlerSpec', () => {
    const h = handler({ fn: () => ({ body: { ok: true } }) });
    expect(isHandlerSpec(h)).toBe(true);
  });

  it('plain function is NOT a HandlerSpec', () => {
    const fn = () => ({ body: { ok: true } });
    expect(isHandlerSpec(fn as any)).toBe(false);
  });

  it('preserves body/query/params slots', () => {
    const schema = { safeParse: () => ({ success: true, data: {} }) } as any;
    const h = handler({ body: schema, fn: () => ({ body: {} }) });
    expect(h.body).toBe(schema);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/handler-factory.test.ts
```
Expected: FAIL — `Cannot find module '../src/handler.js'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/handler.ts
import type { ParseableSchema, MockrRequest, HandlerResult, HandlerContext } from './types.js';

export const HANDLER_SPEC_BRAND = Symbol.for('mockr.HandlerSpec');

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
  fn: (
    req: MockrRequest<{
      body:   TBody   extends ParseableSchema<infer B> ? B : unknown;
      params: TParams extends ParseableSchema<infer P extends Record<string, string>> ? P : Record<string, string>;
      query:  TQuery  extends ParseableSchema<infer Q extends Record<string, unknown>> ? Q : Record<string, string | string[]>;
    }>,
    ctx: HandlerContext<TEndpoints>,
  ) => HandlerResult | Promise<HandlerResult>;
}

export function handler<
  TBody extends ParseableSchema | undefined = undefined,
  TQuery extends ParseableSchema | undefined = undefined,
  TParams extends ParseableSchema | undefined = undefined,
  TEndpoints = Record<string, unknown>,
>(spec: Omit<HandlerSpec<TBody, TQuery, TParams, TEndpoints>, typeof HANDLER_SPEC_BRAND>): HandlerSpec<TBody, TQuery, TParams, TEndpoints> {
  return { ...spec, [HANDLER_SPEC_BRAND]: true } as HandlerSpec<TBody, TQuery, TParams, TEndpoints>;
}

export function isHandlerSpec(value: unknown): value is HandlerSpec {
  return typeof value === 'object' && value !== null && (value as any)[HANDLER_SPEC_BRAND] === true;
}
```

- [ ] **Step 4: Update `src/index.ts` to re-export from new location**

```ts
// In src/index.ts, REPLACE the existing handler function (lines 37-50) with:
export { handler } from './handler.js';
export type { HandlerSpec } from './handler.js';
```

Keep the `typedData<T>` function as-is for now.

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/handler-factory.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/handler.ts src/index.ts tests/handler-factory.test.ts
git commit -m "feat: brand handler() factory result for validation"
```

---

### Task 2: `file<T>()` factory for typed `dataFile`

**Why:** Junior writes `dataFile: file<Alert[]>('./alerts.json')` once and gets typed handles even though file content is unknown at compile time. Without it, `dataFile: './x.json'` produces `EndpointHandle<unknown>`.

**Files:**
- Create: `src/file.ts`
- Modify: `src/index.ts`
- Test: `tests/file-factory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/file-factory.test.ts
import { describe, it, expect } from 'vitest';
import { file, isFileRef, getFilePath } from '../src/file.js';

describe('file factory', () => {
  it('returns a branded value carrying the path', () => {
    const ref = file<{ x: number }[]>('./data.json');
    expect(isFileRef(ref)).toBe(true);
    expect(getFilePath(ref)).toBe('./data.json');
  });

  it('plain string is NOT a file ref', () => {
    expect(isFileRef('./data.json' as any)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/file-factory.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/file.ts
export const FILE_REF_BRAND = Symbol.for('mockr.FileRef');

export interface FileRef<T = unknown> {
  readonly [FILE_REF_BRAND]: true;
  readonly path: string;
  readonly __type?: T;  // phantom; never read at runtime
}

export function file<T>(path: string): FileRef<T> {
  return { [FILE_REF_BRAND]: true as const, path } as FileRef<T>;
}

export function isFileRef(value: unknown): value is FileRef {
  return typeof value === 'object' && value !== null && (value as any)[FILE_REF_BRAND] === true;
}

export function getFilePath(ref: FileRef): string {
  return ref.path;
}
```

- [ ] **Step 4: Export from index**

```ts
// In src/index.ts, ADD after the handler exports:
export { file } from './file.js';
export type { FileRef } from './file.js';
```

- [ ] **Step 5: Run test**

```bash
npx vitest run tests/file-factory.test.ts
```
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add src/file.ts src/index.ts tests/file-factory.test.ts
git commit -m "feat: add file<T>() factory for typed dataFile"
```

---

### Task 3: `endpoints<T>()` helper for grouping

**Why:** Junior splits mocks across files (`mocks/cart.ts`, `mocks/orders.ts`), each typed against its own URL slice. `endpoints<T>()` enforces shape per group; consumer composes via intersection.

**Files:**
- Create: `src/endpoints-helper.ts`
- Modify: `src/index.ts`
- Test: `tests/endpoints-helper.test.ts`, `tests/endpoints-helper.test-d.ts`

- [ ] **Step 1: Write the runtime test**

```ts
// tests/endpoints-helper.test.ts
import { describe, it, expect } from 'vitest';
import { endpoints } from '../src/endpoints-helper.js';

describe('endpoints<T>() helper', () => {
  it('returns the input array unchanged at runtime', () => {
    const defs = [{ url: '/api/x', data: [{ id: 1 }] }] as const;
    const out = endpoints(defs);
    expect(out).toBe(defs);
  });

  it('accepts empty array', () => {
    expect(endpoints([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/endpoints-helper.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/endpoints-helper.ts
import type { EndpointDef } from './types.js';

export function endpoints<TEndpoints = Record<string, unknown>>(
  defs: ReadonlyArray<EndpointDef<TEndpoints>>,
): ReadonlyArray<EndpointDef<TEndpoints>> {
  return defs;
}
```

Note: the type-level constraint that each item's URL must appear in `TEndpoints` is enforced by `EndpointDef<TEndpoints>` itself once we update it in Phase 2. For now this just provides the export shape.

- [ ] **Step 4: Export from index**

```ts
// In src/index.ts, ADD:
export { endpoints } from './endpoints-helper.js';
```

- [ ] **Step 5: Run runtime test**

```bash
npx vitest run tests/endpoints-helper.test.ts
```
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add src/endpoints-helper.ts src/index.ts tests/endpoints-helper.test.ts
git commit -m "feat: add endpoints<T>() grouping helper"
```

---

## Phase 2 — Type system overhaul

### Task 4: New `RecordHandle<T>` interface

**Why:** Record endpoints (object data, not array) need a different handle API: `set(patch)`, `replace(obj)`, `reset()`. No CRUD methods.

**Files:**
- Create: `src/record-handle.ts`
- Test: `tests/record-handle.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/record-handle.test.ts
import { describe, it, expect } from 'vitest';
import { createRecordHandle } from '../src/record-handle.js';

describe('RecordHandle', () => {
  it('exposes initial data', () => {
    const handle = createRecordHandle({ theme: 'dark', size: 12 });
    expect(handle.data).toEqual({ theme: 'dark', size: 12 });
  });

  it('set() merges a patch', () => {
    const handle = createRecordHandle({ theme: 'dark', size: 12 });
    handle.set({ size: 14 });
    expect(handle.data).toEqual({ theme: 'dark', size: 14 });
  });

  it('replace() overwrites everything', () => {
    const handle = createRecordHandle<{ a?: number; b?: number }>({ a: 1 });
    handle.replace({ b: 2 });
    expect(handle.data).toEqual({ b: 2 });
  });

  it('reset() restores original data', () => {
    const handle = createRecordHandle({ theme: 'dark' });
    handle.set({ theme: 'light' });
    handle.reset();
    expect(handle.data).toEqual({ theme: 'dark' });
  });

  it('reset uses a deep copy of original (mutation does not leak)', () => {
    const original = { nested: { value: 1 } };
    const handle = createRecordHandle(original);
    handle.set({ nested: { value: 99 } });
    handle.reset();
    expect(handle.data).toEqual({ nested: { value: 1 } });
    expect(handle.data.nested).not.toBe(original.nested);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/record-handle.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/record-handle.ts
export interface RecordHandle<T extends object> {
  data: T;
  set(patch: Partial<T>): void;
  replace(value: T): void;
  reset(): void;
}

export function createRecordHandle<T extends object>(initial: T): RecordHandle<T> {
  const original = structuredClone(initial);
  let current: T = structuredClone(initial);

  return {
    get data() { return current; },
    set(patch) { Object.assign(current, patch); },
    replace(value) { current = value; },
    reset() { current = structuredClone(original); },
  };
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest run tests/record-handle.test.ts
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/record-handle.ts tests/record-handle.test.ts
git commit -m "feat: add RecordHandle for object endpoints"
```

---

### Task 5: Extract `ListHandle` from `endpoint-handle.ts`

**Why:** Clean module boundary. List endpoint logic moves to `list-handle.ts` unchanged in behavior, ready for the conditional handle type.

**Files:**
- Read first: `src/endpoint-handle.ts` (143 lines)
- Create: `src/list-handle.ts`
- Test: `tests/list-handle.test.ts`

- [ ] **Step 1: Read existing impl**

Open `src/endpoint-handle.ts`. Note the `createEndpointHandle()` function and methods: `findById`, `where`, `first`, `count`, `has`, `insert`, `nextId`, `update`, `updateMany`, `patch`, `remove`, `clear`, `reset`, `save`, plus `data` getter.

- [ ] **Step 2: Write the regression test**

```ts
// tests/list-handle.test.ts
import { describe, it, expect } from 'vitest';
import { createListHandle } from '../src/list-handle.js';

describe('ListHandle', () => {
  const seed = () => createListHandle([
    { id: 1, name: 'a' },
    { id: 2, name: 'b' },
    { id: 3, name: 'c' },
  ]);

  it('findById returns the item', () => {
    expect(seed().findById(2)).toEqual({ id: 2, name: 'b' });
  });

  it('where(filter) matches by object', () => {
    expect(seed().where({ name: 'a' })).toEqual([{ id: 1, name: 'a' }]);
  });

  it('where(predicate) matches by fn', () => {
    expect(seed().where(i => i.id > 1)).toHaveLength(2);
  });

  it('insert generates next id', () => {
    const h = seed();
    const inserted = h.insert({ name: 'd' } as any);
    expect(inserted).toMatchObject({ id: 4, name: 'd' });
    expect(h.count()).toBe(4);
  });

  it('update patches a field', () => {
    const h = seed();
    h.update(1, { name: 'A' });
    expect(h.findById(1)!.name).toBe('A');
  });

  it('remove deletes the item', () => {
    const h = seed();
    h.remove(2);
    expect(h.has(2)).toBe(false);
    expect(h.count()).toBe(2);
  });

  it('reset restores original', () => {
    const h = seed();
    h.clear();
    h.reset();
    expect(h.count()).toBe(3);
  });

  it('uses custom idKey', () => {
    const h = createListHandle([{ uuid: 'a' }, { uuid: 'b' }], { idKey: 'uuid' });
    expect(h.findById('a')).toEqual({ uuid: 'a' });
  });
});
```

- [ ] **Step 3: Run test**

```bash
npx vitest run tests/list-handle.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4: Create `src/list-handle.ts` by copying the existing impl**

Copy the full content of `src/endpoint-handle.ts` to `src/list-handle.ts`. Then:
- Rename `createEndpointHandle` → `createListHandle`.
- Rename exported interface `EndpointHandle` (if it lives in this file) → `ListHandle`. If `EndpointHandle` is only in `types.ts`, export a new `ListHandle<T>` interface here matching its shape minus `body`/`response`/`handler` fields (those belonged to the unified-handle approach we're killing).
- Final exports: `createListHandle`, `ListHandle<T>`.

```ts
// src/list-handle.ts (target shape — adapt from existing endpoint-handle.ts)
export interface ListHandle<T> {
  data: T[];
  findById(id: string | number): T | undefined;
  where(filter: Partial<T>): T[];
  where(predicate: (item: T) => boolean): T[];
  first(): T | undefined;
  count(): number;
  has(id: string | number): boolean;
  insert(item: T): T;
  nextId(): number;
  update(id: string | number, patch: Partial<T>): T | undefined;
  updateMany(ids: (string | number)[], patch: Partial<T> | ((item: T) => Partial<T>)): T[];
  patch(id: string | number, fields: Partial<T>, defaults?: Partial<T>): T | undefined;
  remove(id: string | number): boolean;
  clear(): void;
  reset(): void;
  save(path: string): Promise<void>;
}

export function createListHandle<T>(initial: T[], opts?: { idKey?: string; dataFile?: string }): ListHandle<T> {
  // ... copy body from existing createEndpointHandle, removing any branches that handle non-array `data`
}
```

- [ ] **Step 5: Run test**

```bash
npx vitest run tests/list-handle.test.ts
```
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/list-handle.ts tests/list-handle.test.ts
git commit -m "feat: extract ListHandle from endpoint-handle"
```

---

### Task 6: Conditional `EndpointHandle<T>` type + factory

**Why:** `EndpointHandle<T>` becomes `T extends any[] ? ListHandle<T> : RecordHandle<T>`. Single factory picks the right runtime impl based on `Array.isArray`.

**Files:**
- Modify: `src/types.ts:33-53` (replace the `EndpointHandle` interface)
- Create: `src/endpoint-handle.ts` (replace the deleted file with a thin dispatcher)
- Test: `tests/endpoint-handle-dispatch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/endpoint-handle-dispatch.test.ts
import { describe, it, expect } from 'vitest';
import { createEndpointHandle } from '../src/endpoint-handle.js';

describe('createEndpointHandle dispatch', () => {
  it('returns a ListHandle for array data', () => {
    const handle: any = createEndpointHandle([{ id: 1 }]);
    expect(typeof handle.findById).toBe('function');
    expect(typeof handle.insert).toBe('function');
    expect((handle as any).set).toBeUndefined();
  });

  it('returns a RecordHandle for object data', () => {
    const handle: any = createEndpointHandle({ theme: 'dark' });
    expect(typeof handle.set).toBe('function');
    expect(typeof handle.replace).toBe('function');
    expect((handle as any).findById).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/endpoint-handle-dispatch.test.ts
```
Expected: FAIL — old `endpoint-handle.ts` still exports the unified handle, no dispatcher.

- [ ] **Step 3: Replace `src/endpoint-handle.ts` with a thin dispatcher**

```ts
// src/endpoint-handle.ts
import { createListHandle, type ListHandle } from './list-handle.js';
import { createRecordHandle, type RecordHandle } from './record-handle.js';

export type EndpointHandle<T = unknown> =
  T extends readonly any[]
    ? ListHandle<T extends readonly (infer U)[] ? U : never>
    : T extends object
      ? RecordHandle<T>
      : never;

export function createEndpointHandle<T>(
  initial: T,
  opts?: { idKey?: string; dataFile?: string },
): EndpointHandle<T> {
  if (Array.isArray(initial)) {
    return createListHandle(initial, opts) as EndpointHandle<T>;
  }
  if (typeof initial === 'object' && initial !== null) {
    return createRecordHandle(initial as object) as EndpointHandle<T>;
  }
  throw new Error(`mockr: data must be an array or object, got ${typeof initial}`);
}
```

- [ ] **Step 4: Update `src/types.ts` — remove the old EndpointHandle interface**

In `src/types.ts`, delete lines 30-53 (the `ElementOf`, `EndpointHandle` interface, and `ValidatedHandler` if it's now unused — keep `ValidatedHandler` until Task 9 since `index.ts` may still reference it).

Add a re-export at the top of types.ts:
```ts
export type { EndpointHandle } from './endpoint-handle.js';
export type { ListHandle } from './list-handle.js';
export type { RecordHandle } from './record-handle.js';
```

(If TypeScript complains about circular imports, move the re-export to `index.ts` instead and have `types.ts` import the type internally.)

- [ ] **Step 5: Run test**

```bash
npx vitest run tests/endpoint-handle-dispatch.test.ts
```
Expected: PASS, 2 tests.

- [ ] **Step 6: Run the existing test suite**

```bash
npm test
```
Expected: Most tests pass. Some tests against record/static endpoints may now use new handle shape — note failures, fix in next phase. If type tests fail, address in Task 22.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/endpoint-handle.ts tests/endpoint-handle-dispatch.test.ts
git commit -m "feat: conditional EndpointHandle dispatches by data shape"
```

---

### Task 7: New `EndpointDef` discriminated union

**Why:** Collapse five forms (`body`, `response`, `data`, `dataFile`, `handler`) to three (`data`, `dataFile`, `handler`) plus `methods` overlay. `body` reserved for request side only.

**Files:**
- Modify: `src/types.ts:80-95` (the `EndpointDef` union)

- [ ] **Step 1: Read current EndpointDef** at `src/types.ts:80-95` to understand existing field guards.

- [ ] **Step 2: Replace with new union**

```ts
// In src/types.ts, REPLACE the existing EndpointDef export (around line 80) with:
import type { FileRef } from './file.js';
import type { HandlerSpec } from './handler.js';

export type MethodMap<TEndpoints = Record<string, unknown>> = Partial<
  Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD', HandlerSpec<any, any, any, TEndpoints>>
>;

export type EndpointDef<TEndpoints = Record<string, unknown>> =
  | {
      url: string | RegExp;
      method?: string;
      data: unknown;
      idKey?: string;
      methods?: MethodMap<TEndpoints>;
      dataFile?: never;
      handler?: never;
      body?: never;
      response?: never;
    }
  | {
      url: string | RegExp;
      method?: string;
      dataFile: FileRef | string;
      idKey?: string;
      methods?: MethodMap<TEndpoints>;
      data?: never;
      handler?: never;
      body?: never;
      response?: never;
    }
  | {
      url: string | RegExp;
      method?: string;
      handler: HandlerSpec<any, any, any, TEndpoints>;
      data?: never;
      dataFile?: never;
      body?: never;
      response?: never;
      methods?: never;
    }
  | {
      url: string | RegExp;
      methods: MethodMap<TEndpoints>;
      method?: never;
      data?: never;
      dataFile?: never;
      handler?: never;
      body?: never;
      response?: never;
    };
```

- [ ] **Step 3: Verify the type compiles**

```bash
npx tsc -p tsconfig.json --noEmit 2>&1 | head -100
```

Expected: many errors in `server.ts`, examples, and tests — these get fixed in later tasks. The error count should be finite and concentrated in known files. If errors appear in unrelated locations, stop and investigate.

- [ ] **Step 4: Commit (broken intermediate state)**

```bash
git add src/types.ts
git commit -m "feat(types): new EndpointDef with 3 forms + methods overlay (WIP, breaks server.ts)"
```

This commit intentionally leaves the build broken; subsequent tasks restore it.

---

## Phase 3 — Validation

### Task 8: `config-validator.ts` — pure validation function

**Why:** Boot-time validation throws aggregated errors so junior sees every typo at once.

**Files:**
- Create: `src/config-validator.ts`
- Test: `tests/config-validator.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/config-validator.test.ts
import { describe, it, expect } from 'vitest';
import { validateConfig } from '../src/config-validator.js';
import { handler } from '../src/handler.js';
import { file } from '../src/file.js';

describe('validateConfig', () => {
  it('passes valid config', () => {
    const result = validateConfig({
      endpoints: [
        { url: '/api/x', data: [{ id: 1 }] },
        { url: '/api/y', dataFile: file('./y.json') },
        { url: '/api/z', handler: handler({ fn: () => ({ body: {} }) }) },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it('rejects unknown key with did-you-mean suggestion', () => {
    const result = validateConfig({
      endpoints: [{ url: '/api/x', dataFiel: './x.json' } as any],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatchObject({
      index: 0,
      url: '/api/x',
      message: expect.stringContaining("'dataFiel' is not a known key"),
    });
    expect(result.errors[0].message).toContain('dataFile');
  });

  it('rejects data + handler together', () => {
    const result = validateConfig({
      endpoints: [{ url: '/api/x', data: [], handler: handler({ fn: () => ({ body: {} }) }) } as any],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("cannot set both 'data' and 'handler'");
  });

  it('rejects duplicate URL+method', () => {
    const h = handler({ fn: () => ({ body: {} }) });
    const result = validateConfig({
      endpoints: [
        { url: '/api/x', method: 'GET', handler: h },
        { url: '/api/x', method: 'GET', handler: h },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('duplicate URL+method');
  });

  it('rejects raw function as handler', () => {
    const result = validateConfig({
      endpoints: [{ url: '/api/x', handler: ((req: any) => ({ body: {} })) as any }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('handler must be created by handler({...})');
  });

  it('rejects malformed methods map (lowercase verb)', () => {
    const h = handler({ fn: () => ({ body: {} }) });
    const result = validateConfig({
      endpoints: [{ url: '/api/x', methods: { get: h } as any }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('methods keys must be uppercase HTTP verbs');
  });

  it('aggregates multiple errors', () => {
    const result = validateConfig({
      endpoints: [
        { url: '/api/x', dataFiel: './x.json' } as any,
        { url: '/api/y', data: [], handler: handler({ fn: () => ({ body: {} }) }) } as any,
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/config-validator.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/config-validator.ts
import type { MockrConfig, EndpointDef } from './types.js';
import { isHandlerSpec } from './handler.js';
import { isFileRef } from './file.js';

const KNOWN_KEYS = new Set([
  'url', 'method', 'data', 'dataFile', 'handler', 'methods', 'idKey',
]);
const VALID_VERBS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

export interface ConfigError {
  index: number;
  url: string;
  message: string;
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: ConfigError[] };

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function suggest(key: string): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const known of KNOWN_KEYS) {
    const d = levenshtein(key, known);
    if (d < bestDist && d <= 2) {
      bestDist = d;
      best = known;
    }
  }
  return best;
}

export function validateConfig(config: MockrConfig<any>): ValidationResult {
  const errors: ConfigError[] = [];
  const seen = new Set<string>();
  const defs = config.endpoints ?? [];

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i] as Record<string, unknown> & EndpointDef;
    const urlStr = typeof def.url === 'string' ? def.url : String(def.url);
    const push = (msg: string) => errors.push({ index: i, url: urlStr, message: msg });

    // Unknown keys
    for (const key of Object.keys(def)) {
      if (!KNOWN_KEYS.has(key)) {
        const hint = suggest(key);
        push(`'${key}' is not a known key${hint ? ` (did you mean '${hint}'?)` : ''}`);
      }
    }

    // Form conflicts
    const hasData = 'data' in def && def.data !== undefined;
    const hasFile = 'dataFile' in def && def.dataFile !== undefined;
    const hasHandler = 'handler' in def && def.handler !== undefined;
    const hasMethods = 'methods' in def && def.methods !== undefined;

    if (hasData && hasHandler) push("cannot set both 'data' and 'handler'");
    if (hasData && hasFile)    push("cannot set both 'data' and 'dataFile'");
    if (hasFile && hasHandler) push("cannot set both 'dataFile' and 'handler'");
    if (hasHandler && hasMethods) push("cannot set both 'handler' and 'methods' (use methods alone)");
    if (def.method && hasMethods) push("cannot set both 'method' and 'methods'");

    // Handler must be factory result
    if (hasHandler && !isHandlerSpec(def.handler)) {
      push("'handler' must be created by handler({...}) — raw functions are not allowed");
    }

    // Methods map shape
    if (hasMethods) {
      const m = def.methods as Record<string, unknown>;
      for (const verb of Object.keys(m)) {
        if (!VALID_VERBS.has(verb)) {
          push(`methods keys must be uppercase HTTP verbs (got '${verb}')`);
        } else if (!isHandlerSpec(m[verb])) {
          push(`methods.${verb} must be created by handler({...})`);
        }
      }
    }

    // dataFile shape
    if (hasFile) {
      const f = def.dataFile;
      if (typeof f !== 'string' && !isFileRef(f)) {
        push("'dataFile' must be a string path or file<T>('./path')");
      }
    }

    // Duplicate URL+method
    if (typeof def.url === 'string') {
      const method = (def.method ?? 'GET').toUpperCase();
      const key = `${method}::${def.url}`;
      if (seen.has(key)) {
        push(`duplicate URL+method`);
      } else {
        seen.add(key);
      }
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

export function formatErrors(errors: ConfigError[]): string {
  const lines = errors.map((e) => `  [${e.index}] ${e.url}: ${e.message}`);
  return `mockr: ${errors.length} endpoint definition${errors.length === 1 ? '' : 's'} invalid:\n${lines.join('\n')}`;
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest run tests/config-validator.test.ts
```
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/config-validator.ts tests/config-validator.test.ts
git commit -m "feat: add boot-time config validator with did-you-mean"
```

---

### Task 9: Wire validator into `mockr({...})` boot

**Why:** Invalid config throws aggregated error before binding port.

**Files:**
- Modify: `src/server.ts` (find the `export async function mockr(config: ...)` declaration, around line 1)
- Test: `tests/config-validator-integration.test.ts`

- [ ] **Step 1: Write integration test**

```ts
// tests/config-validator-integration.test.ts
import { describe, it, expect } from 'vitest';
import { mockr } from '../src/index.js';

describe('mockr boot validation', () => {
  it('throws on invalid config', async () => {
    await expect(
      mockr({
        endpoints: [{ url: '/api/x', dataFiel: './x.json' } as any],
      }),
    ).rejects.toThrow(/'dataFiel' is not a known key/);
  });

  it('aggregates multiple errors in one throw', async () => {
    const err = await mockr({
      endpoints: [
        { url: '/api/x', dataFiel: './x.json' } as any,
        { url: '/api/x', method: 'POST', data: [], handler: (() => {}) as any } as any,
      ],
    }).catch((e) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/2 endpoint definitions invalid/);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/config-validator-integration.test.ts
```
Expected: FAIL — server still accepts invalid config.

- [ ] **Step 3: Wire validator into `src/server.ts`**

At the top of `mockr()` (find the function in `src/server.ts`; first lines after argument destructuring, before any port binding or endpoint registration), insert:

```ts
import { validateConfig, formatErrors } from './config-validator.js';

// Inside `mockr(config)` body, FIRST thing after the signature:
const validation = validateConfig(config);
if (!validation.valid) {
  throw new Error(formatErrors(validation.errors));
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest run tests/config-validator-integration.test.ts
```
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts tests/config-validator-integration.test.ts
git commit -m "feat: throw aggregated error on invalid mockr config"
```

---

## Phase 4 — Hot-reload `dataFile`

### Task 10: `data-file-watcher.ts`

**Why:** Filesystem changes to `dataFile` reload endpoint state. Reset semantics, debounce 100ms, keep last good copy on bad JSON.

**Files:**
- Create: `src/data-file-watcher.ts`
- Test: `tests/data-file-watcher.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/data-file-watcher.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDataFileWatcher } from '../src/data-file-watcher.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('data-file-watcher', () => {
  let dir: string;
  let path: string;
  let watcher: ReturnType<typeof createDataFileWatcher>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mockr-watch-'));
    path = join(dir, 'data.json');
    writeFileSync(path, JSON.stringify([{ id: 1 }]));
    watcher = createDataFileWatcher();
  });

  afterEach(() => {
    watcher.closeAll();
    rmSync(dir, { recursive: true, force: true });
  });

  it('fires onChange with new content when file is rewritten', async () => {
    let received: unknown = null;
    watcher.register(path, (data) => { received = data; });
    writeFileSync(path, JSON.stringify([{ id: 2 }]));
    await wait(200);
    expect(received).toEqual([{ id: 2 }]);
  });

  it('debounces rapid writes', async () => {
    let count = 0;
    watcher.register(path, () => { count++; });
    writeFileSync(path, JSON.stringify([{ id: 1 }]));
    writeFileSync(path, JSON.stringify([{ id: 2 }]));
    writeFileSync(path, JSON.stringify([{ id: 3 }]));
    await wait(200);
    expect(count).toBeLessThanOrEqual(1);
  });

  it('does not fire onChange on bad JSON; keeps last good', async () => {
    let received: unknown = null;
    watcher.register(path, (data) => { received = data; });
    writeFileSync(path, '{ not valid json');
    await wait(200);
    expect(received).toBeNull();
  });

  it('closeAll stops watching', async () => {
    let count = 0;
    watcher.register(path, () => { count++; });
    watcher.closeAll();
    writeFileSync(path, JSON.stringify([{ id: 99 }]));
    await wait(200);
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/data-file-watcher.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/data-file-watcher.ts
import { watch, readFileSync, type FSWatcher } from 'node:fs';

const DEBOUNCE_MS = 100;

export interface DataFileWatcher {
  register(path: string, onChange: (data: unknown) => void): void;
  closeAll(): void;
}

export function createDataFileWatcher(): DataFileWatcher {
  const watchers: FSWatcher[] = [];
  const timers = new Map<string, NodeJS.Timeout>();

  return {
    register(path, onChange) {
      const fire = () => {
        let raw: string;
        try {
          raw = readFileSync(path, 'utf8');
        } catch (err) {
          console.error(`mockr: failed to read ${path}:`, (err as Error).message);
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (err) {
          console.error(`mockr: invalid JSON in ${path} (keeping last good copy):`, (err as Error).message);
          return;
        }
        onChange(parsed);
      };

      const w = watch(path, () => {
        const existing = timers.get(path);
        if (existing) clearTimeout(existing);
        const t = setTimeout(() => {
          timers.delete(path);
          fire();
        }, DEBOUNCE_MS);
        timers.set(path, t);
      });
      watchers.push(w);
    },

    closeAll() {
      for (const w of watchers) w.close();
      watchers.length = 0;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest run tests/data-file-watcher.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data-file-watcher.ts tests/data-file-watcher.test.ts
git commit -m "feat: data-file watcher with debounce + reset semantics"
```

---

### Task 11: Wire watcher into server's `dataFile` endpoint registration

**Why:** Each `dataFile` endpoint registers a watcher; on file change, the endpoint's handle resets to the new content.

**Files:**
- Modify: `src/server.ts` (find the section that handles `dataFile` — search for `dataFile` in the file, likely in the endpoint registration loop around lines 100-200)
- Test: `tests/data-file-hot-reload.test.ts`

- [ ] **Step 1: Write integration test**

```ts
// tests/data-file-hot-reload.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mockr } from '../src/index.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('dataFile hot-reload', () => {
  let dir: string;
  let path: string;
  let server: Awaited<ReturnType<typeof mockr>>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mockr-hr-'));
    path = join(dir, 'items.json');
    writeFileSync(path, JSON.stringify([{ id: 1, name: 'a' }]));
    server = await mockr({
      port: 0, // any free port
      endpoints: [{ url: '/api/items', dataFile: path }],
    });
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves new content after file change', async () => {
    const before = await fetch(`${server.url}/api/items`).then((r) => r.json());
    expect(before).toEqual([{ id: 1, name: 'a' }]);

    writeFileSync(path, JSON.stringify([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]));
    await wait(250);

    const after = await fetch(`${server.url}/api/items`).then((r) => r.json());
    expect(after).toEqual([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]);
  });

  it('drops in-memory mutations on reload (reset semantics)', async () => {
    await fetch(`${server.url}/api/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'temp' }),
    });
    const mid = await fetch(`${server.url}/api/items`).then((r) => r.json());
    expect(mid).toHaveLength(2);

    writeFileSync(path, JSON.stringify([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]));
    await wait(250);

    const after = await fetch(`${server.url}/api/items`).then((r) => r.json());
    expect(after).toEqual([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/data-file-hot-reload.test.ts
```
Expected: FAIL — server does not reload on file change.

- [ ] **Step 3: Wire watcher into server**

In `src/server.ts`:
1. At the top: `import { createDataFileWatcher } from './data-file-watcher.js';` and `import { isFileRef, getFilePath } from './file.js';`.
2. In `mockr()`, after `validateConfig`, create: `const watcher = createDataFileWatcher();`.
3. In the endpoint registration code (the section that loads `dataFile` content), after creating the handle, register a watcher:

```ts
// Inside the dataFile branch of endpoint registration:
const path = isFileRef(def.dataFile) ? getFilePath(def.dataFile) : def.dataFile;
const initial = JSON.parse(readFileSync(path, 'utf8'));
const handle = createEndpointHandle(initial, { idKey: def.idKey, dataFile: path });

watcher.register(path, (newData) => {
  // Reset semantics: replace handle's data
  if (Array.isArray(newData) && 'replaceData' in handle) {
    (handle as any).replaceData?.(newData);
  } else if ('replace' in handle) {
    (handle as RecordHandle<any>).replace(newData as any);
  }
  // For ListHandle, add a `replaceData(arr)` method to list-handle.ts in this same task if it doesn't exist.
});
```

4. Add `replaceData(arr: T[])` method to `ListHandle<T>` in `src/list-handle.ts`:

```ts
// In src/list-handle.ts, add to the ListHandle interface:
replaceData(items: T[]): void;

// And in createListHandle implementation:
replaceData(items) {
  current.length = 0;
  current.push(...items);
  // Also update the baseline so subsequent .reset() goes to the new data
  baseline = structuredClone(items);
},
```

5. In `server.close()`, add `watcher.closeAll();` before returning.

- [ ] **Step 4: Run test**

```bash
npx vitest run tests/data-file-hot-reload.test.ts
```
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts src/list-handle.ts tests/data-file-hot-reload.test.ts
git commit -m "feat: hot-reload dataFile on filesystem changes"
```

---

## Phase 5 — Multi-method (`methods` map)

### Task 12: Router dispatch with `methods` map

**Why:** Single endpoint entry can declare multiple HTTP verbs in a `methods` map. Existing single-method `method` field still works as shorthand.

**Files:**
- Modify: `src/server.ts` (the endpoint match/dispatch logic — search for `req.method` or `def.method` in the routing code)
- Test: `tests/methods-map.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/methods-map.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mockr, handler } from '../src/index.js';

describe('methods map', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => { await server?.close(); });

  it('dispatches GET and POST from a single endpoint entry', async () => {
    server = await mockr({
      port: 0,
      endpoints: [
        {
          url: '/api/x',
          methods: {
            GET:  handler({ fn: () => ({ body: { kind: 'get' } }) }),
            POST: handler({ fn: () => ({ body: { kind: 'post' } }) }),
          },
        },
      ],
    });
    const g = await fetch(`${server.url}/api/x`).then((r) => r.json());
    const p = await fetch(`${server.url}/api/x`, { method: 'POST' }).then((r) => r.json());
    expect(g).toEqual({ kind: 'get' });
    expect(p).toEqual({ kind: 'post' });
  });

  it('returns 405 for verb not in methods map', async () => {
    server = await mockr({
      port: 0,
      endpoints: [
        { url: '/api/x', methods: { GET: handler({ fn: () => ({ body: 'ok' }) }) } },
      ],
    });
    const res = await fetch(`${server.url}/api/x`, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('methods overrides default CRUD on data endpoint', async () => {
    server = await mockr({
      port: 0,
      endpoints: [
        {
          url: '/api/items',
          data: [{ id: 1, name: 'a' }],
          methods: {
            POST: handler({ fn: () => ({ body: { custom: true } }) }),
          },
        },
      ],
    });
    // GET still works (default CRUD)
    const g = await fetch(`${server.url}/api/items`).then((r) => r.json());
    expect(g).toEqual([{ id: 1, name: 'a' }]);
    // POST is overridden
    const p = await fetch(`${server.url}/api/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }).then((r) => r.json());
    expect(p).toEqual({ custom: true });
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/methods-map.test.ts
```
Expected: FAIL — server doesn't read `methods` map yet.

- [ ] **Step 3: Implement**

In `src/server.ts`, find the request dispatch section. The current pattern matches by URL then by method against `def.method`. Add: when an endpoint def has `def.methods`, look up the request method in `def.methods` first; if found, use that handler; if a request method has no entry but the def also has `data`/`dataFile`, fall through to default CRUD; if no entry and no fallback, respond 405.

Pseudocode for the dispatch (engineer adapts to actual server.ts shape):

```ts
function pickHandlerForRequest(def: EndpointDef, reqMethod: string) {
  const verb = reqMethod.toUpperCase();

  // 1. methods map override
  if (def.methods && def.methods[verb as keyof typeof def.methods]) {
    return { kind: 'spec' as const, spec: def.methods[verb as keyof typeof def.methods]! };
  }

  // 2. top-level handler
  if (def.handler) {
    if (def.method && def.method.toUpperCase() !== verb) return null;
    return { kind: 'spec' as const, spec: def.handler };
  }

  // 3. default CRUD on data/dataFile
  if (def.data !== undefined || def.dataFile !== undefined) {
    return { kind: 'crud' as const, verb };
  }

  // 4. methods map exists but verb not present
  if (def.methods) return { kind: '405' as const };

  return null;
}
```

The default-CRUD branch uses the existing CRUD logic (GET → list, GET /:id → findById, POST → insert, PUT/PATCH → update, DELETE → remove). Methods override only the matching verb.

Add a 405 response helper in `src/http-utils.ts` if not present:
```ts
export function send405(res: ServerResponse, allowed: string[]): void {
  res.statusCode = 405;
  res.setHeader('Allow', allowed.join(', '));
  res.end();
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest run tests/methods-map.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```
Expected: existing tests may have regressions where `methods` overlap with old `method` field expectations. Note failures, do not fix yet — fix in Task 23.

- [ ] **Step 6: Commit**

```bash
git add src/server.ts src/http-utils.ts tests/methods-map.test.ts
git commit -m "feat: support methods map for multi-verb endpoints"
```

---

## Phase 6 — Server cleanup (drop old forms)

### Task 13: Remove `body`/`response` forms; rename `ctx.endpoints` → `ctx.endpoint`

**Why:** Spec mandates 3 forms only. Old `body`/`response` forms must be deleted from runtime + types. `ctx` API renamed for symmetry with `server.endpoint`.

**Files:**
- Modify: `src/server.ts` (search for `def.body`, `def.response`, `ctx.endpoints`)
- Modify: `src/types.ts` (the `HandlerContext` interface around lines 24-28)

- [ ] **Step 1: Write failing test**

```ts
// tests/ctx-endpoint-singular.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mockr, handler } from '../src/index.js';

describe('ctx.endpoint (singular)', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => { await server?.close(); });

  it('exposes ctx.endpoint(url) returning a handle', async () => {
    server = await mockr({
      port: 0,
      endpoints: [
        { url: '/internal/x', data: [{ id: 1, v: 'a' }] },
        {
          url: '/api/x',
          handler: handler({
            fn: (req, ctx) => ({ body: ctx.endpoint('/internal/x').data }),
          }),
        },
      ],
    });
    const out = await fetch(`${server.url}/api/x`).then((r) => r.json());
    expect(out).toEqual([{ id: 1, v: 'a' }]);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/ctx-endpoint-singular.test.ts
```
Expected: FAIL — `ctx.endpoint is not a function` (today exposes `ctx.endpoints`).

- [ ] **Step 3: Update `HandlerContext` in `src/types.ts`**

```ts
// In src/types.ts, REPLACE HandlerContext:
export interface HandlerContext<TEndpoints = Record<string, unknown>> {
  endpoint: [keyof TEndpoints] extends [never]
    ? (url: string) => EndpointHandle
    : <K extends keyof TEndpoints>(url: K) => EndpointHandle<TEndpoints[K]>;
}
```

- [ ] **Step 4: Update `src/server.ts`**

Find every place that builds the handler context (search for `endpoints:` followed by a function returning a handle). Rename to `endpoint:`.

Find every place that handles `def.body` or `def.response` as endpoint shorthand and **delete those branches**. They are no longer valid forms.

- [ ] **Step 5: Run test**

```bash
npx vitest run tests/ctx-endpoint-singular.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/server.ts tests/ctx-endpoint-singular.test.ts
git commit -m "refactor: ctx.endpoint singular; remove body/response forms"
```

---

### Task 14: Refactor endpoint registration into discriminated dispatch

**Why:** `server.ts:115-162` is a chained conditional with `as any` casts. Replace with a small dispatch table — one function per kind (`registerData`, `registerDataFile`, `registerHandler`, `registerMethodsOnly`).

**Files:**
- Modify: `src/server.ts` (the endpoint registration loop)

- [ ] **Step 1: Locate the registration loop**

In `src/server.ts`, find the loop that iterates `config.endpoints` and creates handles per endpoint. Note the current line range.

- [ ] **Step 2: Write a regression smoke test (if not already covered)**

```ts
// tests/registration-smoke.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mockr, handler, file } from '../src/index.js';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('endpoint registration smoke', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  let dir: string;
  afterEach(async () => {
    await server?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('registers data, dataFile, handler, methods-only in one config', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mockr-reg-'));
    const path = join(dir, 'd.json');
    writeFileSync(path, JSON.stringify([{ id: 1 }]));

    server = await mockr({
      port: 0,
      endpoints: [
        { url: '/a', data: [{ id: 1 }] },
        { url: '/b', data: { theme: 'dark' } },
        { url: '/c', dataFile: file<unknown[]>(path) },
        { url: '/d', handler: handler({ fn: () => ({ body: 'd' }) }) },
        { url: '/e', methods: { GET: handler({ fn: () => ({ body: 'e' }) }) } },
      ],
    });

    expect(await fetch(`${server.url}/a`).then((r) => r.json())).toEqual([{ id: 1 }]);
    expect(await fetch(`${server.url}/b`).then((r) => r.json())).toEqual({ theme: 'dark' });
    expect(await fetch(`${server.url}/c`).then((r) => r.json())).toEqual([{ id: 1 }]);
    expect(await fetch(`${server.url}/d`).then((r) => r.text())).toBe('"d"');
    expect(await fetch(`${server.url}/e`).then((r) => r.text())).toBe('"e"');
  });
});
```

- [ ] **Step 3: Refactor**

Replace the chained conditional in `src/server.ts` with:

```ts
// Helper to read raw def shape and pick kind
function classifyDef(def: EndpointDef): 'data' | 'dataFile' | 'handler' | 'methodsOnly' {
  if ('handler' in def && def.handler !== undefined) return 'handler';
  if ('dataFile' in def && def.dataFile !== undefined) return 'dataFile';
  if ('data' in def && def.data !== undefined) return 'data';
  if ('methods' in def && def.methods !== undefined) return 'methodsOnly';
  throw new Error(`mockr: endpoint ${String(def.url)} has no data/dataFile/handler/methods`);
}

// Each register function returns the registered handle (or null for methodsOnly)
function registerData(def, registry, watcher) { /* ... */ }
function registerDataFile(def, registry, watcher) { /* ... */ }
function registerHandler(def, registry) { /* ... */ }
function registerMethodsOnly(def, registry) { /* ... */ }

// Main loop:
for (const def of config.endpoints ?? []) {
  switch (classifyDef(def)) {
    case 'data':        registerData(def, registry, watcher); break;
    case 'dataFile':    registerDataFile(def, registry, watcher); break;
    case 'handler':     registerHandler(def, registry); break;
    case 'methodsOnly': registerMethodsOnly(def, registry); break;
  }
}
```

Each `register*` function holds the logic that previously lived inside the chained conditional, with proper types (no `as any`). The engineer should ensure any `(def as any).idKey` and `def.data as unknown[]` casts go away.

- [ ] **Step 4: Run smoke test**

```bash
npx vitest run tests/registration-smoke.test.ts
```
Expected: PASS, 1 test.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```
Expected: most pass; flag remaining regressions for Task 23.

- [ ] **Step 6: Commit**

```bash
git add src/server.ts tests/registration-smoke.test.ts
git commit -m "refactor: dispatch endpoint registration by kind, drop any-casts"
```

---

## Phase 7 — Scenarios redesign

### Task 15: Declarative scenarios

**Why:** Scenarios become `() => { [url]: EndpointDefPatch }` returning patches. `baseline(url)` helper returns original data. No imperative `.insert()` / `.clear()` inside scenarios.

**Files:**
- Modify: `src/types.ts` (replace `ScenarioSetup` with new shape)
- Create: `src/scenarios.ts`
- Modify: `src/server.ts` (use new scenarios module)
- Test: `tests/scenarios.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/scenarios.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mockr, handler } from '../src/index.js';

describe('declarative scenarios', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => { await server?.close(); });

  const baseEndpoints = [
    { url: '/users', data: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]},
  ];

  it('replaces data via patch', async () => {
    server = await mockr({
      port: 0,
      endpoints: baseEndpoints,
      scenarios: {
        empty: () => ({ '/users': { data: [] } }),
      },
    });
    await server.scenario('empty');
    const out = await fetch(`${server.url}/users`).then((r) => r.json());
    expect(out).toEqual([]);
  });

  it('extends via baseline()', async () => {
    server = await mockr({
      port: 0,
      endpoints: baseEndpoints,
      scenarios: {
        crowded: ({ baseline }) => ({
          '/users': {
            data: [...baseline('/users'), { id: 3, name: 'Carol' }],
          },
        }),
      },
    });
    await server.scenario('crowded');
    const out = await fetch(`${server.url}/users`).then((r) => r.json());
    expect(out).toHaveLength(3);
    expect(out.at(-1).name).toBe('Carol');
  });

  it('swaps handler for entire endpoint via patch', async () => {
    server = await mockr({
      port: 0,
      endpoints: baseEndpoints,
      scenarios: {
        down: () => ({
          '/users': { handler: handler({ fn: () => ({ status: 503, body: { error: 'down' } }) }) },
        }),
      },
    });
    await server.scenario('down');
    const res = await fetch(`${server.url}/users`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'down' });
  });

  it('reset() restores baseline', async () => {
    server = await mockr({
      port: 0,
      endpoints: baseEndpoints,
      scenarios: { empty: () => ({ '/users': { data: [] } }) },
    });
    await server.scenario('empty');
    await server.reset();
    const out = await fetch(`${server.url}/users`).then((r) => r.json());
    expect(out).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/scenarios.test.ts
```
Expected: FAIL — old scenarios shape is `(s) => void` imperative.

- [ ] **Step 3: Update types**

```ts
// In src/types.ts, REPLACE ScenarioSetup and the scenarios field of MockrConfig:
import type { FileRef } from './file.js';
import type { HandlerSpec } from './handler.js';

export interface ScenarioContext<TEndpoints = Record<string, unknown>> {
  baseline: <K extends keyof TEndpoints>(url: K) => TEndpoints[K];
}

export type EndpointDefPatch<TEndpoints = Record<string, unknown>> = {
  data?: unknown;
  dataFile?: FileRef | string;
  handler?: HandlerSpec<any, any, any, TEndpoints>;
  methods?: MethodMap<TEndpoints>;
};

export type ScenarioFn<TEndpoints = Record<string, unknown>> =
  (ctx: ScenarioContext<TEndpoints>) => Partial<Record<keyof TEndpoints | string, EndpointDefPatch<TEndpoints>>>;

// In MockrConfig:
scenarios?: Record<string, ScenarioFn<TEndpoints>>;
```

- [ ] **Step 4: Implement `src/scenarios.ts`**

```ts
// src/scenarios.ts
import type { ScenarioFn, EndpointDefPatch } from './types.js';

export interface ScenariosState {
  baselines: Map<string, unknown>;
  active: string | null;
}

export function createScenariosState(initialData: Map<string, unknown>): ScenariosState {
  return { baselines: new Map(initialData), active: null };
}

export function applyScenario(
  state: ScenariosState,
  scenarioFn: ScenarioFn,
  applyPatch: (url: string, patch: EndpointDefPatch) => void,
): void {
  const ctx = {
    baseline: (url: string) => structuredClone(state.baselines.get(url)),
  } as any;
  const patches = scenarioFn(ctx);
  for (const [url, patch] of Object.entries(patches)) {
    applyPatch(url, patch as EndpointDefPatch);
  }
}
```

- [ ] **Step 5: Wire into `src/server.ts`**

Replace the existing scenario implementation:
1. On boot, populate `baselines` from each `data` endpoint's initial data and each `dataFile`'s initial loaded content.
2. `server.scenario(name)` calls `applyScenario(state, fn, applyPatch)` where `applyPatch(url, patch)`:
   - if `patch.data` defined: replaces handle's data (use `replaceData` for list, `replace` for record)
   - if `patch.handler` defined: swaps the registered handler for that URL
   - if `patch.methods` defined: merges into the URL's methods map
   - if `patch.dataFile` defined: rare (mostly for completeness); reload from new path
3. `server.reset()` reloads baselines into all handles + clears scenario state.

- [ ] **Step 6: Run test**

```bash
npx vitest run tests/scenarios.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/scenarios.ts src/server.ts tests/scenarios.test.ts
git commit -m "feat: declarative scenarios with baseline() helper"
```

---

## Phase 8 — Polish

### Task 16: idKey startup warning

**Why:** Silent fallback to array index when `idKey` field absent on items confuses junior. Warn loudly at boot.

**Files:**
- Modify: `src/server.ts` (or a new helper function called during data endpoint registration)

- [ ] **Step 1: Write failing test**

```ts
// tests/id-key-warning.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mockr } from '../src/index.js';

describe('idKey warning', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => { await server?.close(); });

  it('warns when items lack the configured idKey', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    server = await mockr({
      port: 0,
      endpoints: [{ url: '/a', data: [{ name: 'no-id-here' }] }],
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("idKey 'id' not found on items"),
    );
    warnSpy.mockRestore();
  });

  it('does not warn when items have the idKey', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    server = await mockr({
      port: 0,
      endpoints: [{ url: '/a', data: [{ id: 1, name: 'ok' }] }],
    });
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("idKey 'id' not found"),
    );
    warnSpy.mockRestore();
  });

  it('respects custom idKey', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    server = await mockr({
      port: 0,
      endpoints: [{ url: '/a', data: [{ uuid: 'abc' }], idKey: 'uuid' }],
    });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/id-key-warning.test.ts
```
Expected: FAIL — no warning emitted today.

- [ ] **Step 3: Implement warning**

Inside the data-endpoint registration in `src/server.ts` (or in `registerData` from Task 14), after determining `idKey` (default `'id'`):

```ts
if (Array.isArray(data) && data.length > 0) {
  const hasKey = data.some((item) => item != null && typeof item === 'object' && idKey in item);
  if (!hasKey) {
    console.warn(
      `mockr: endpoint ${String(def.url)} — idKey '${idKey}' not found on items, ` +
      `defaulting to array index. Set idKey explicitly or add the field to your data.`,
    );
  }
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest run tests/id-key-warning.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts tests/id-key-warning.test.ts
git commit -m "feat: warn at startup when idKey field missing on data items"
```

---

### Task 17: Update existing examples to new API

**Why:** Examples are the README's truth. They must compile under v0.3.0 and showcase the new shape.

**Files:**
- Modify: `examples/todo/server.ts`
- Modify: `examples/auth-api/server.ts`
- Modify: `examples/ecommerce/server.ts`
- Modify: `examples/chat/server.ts`
- Modify: `examples/proxy/server.ts`
- Modify: `playground/server.ts`

- [ ] **Step 1: Read each example**

```bash
ls examples/*/server.ts examples/start-all.ts playground/server.ts
```

- [ ] **Step 2: Update `examples/todo/server.ts`**

```ts
// examples/todo/server.ts
import { mockr } from '../../src/index.js';

interface Todo { id: number; title: string; done: boolean; }

type Endpoints = {
  '/api/todos': Todo[];
};

const server = await mockr<Endpoints>({
  port: 3001,
  endpoints: [
    {
      url: '/api/todos',
      data: [
        { id: 1, title: 'Buy milk', done: false },
        { id: 2, title: 'Write tests', done: true },
        { id: 3, title: 'Deploy to prod', done: false },
      ],
    },
  ],
});

console.log(`Todo API running at ${server.url}`);
```

(The `Endpoints` type now uses `Todo[]` explicitly per spec decision.)

- [ ] **Step 3: Update `examples/auth-api/server.ts`**

Convert raw-function handlers to `handler({...})` factory calls. Convert old `s.endpoint(...).handler = fn` scenario assignments to declarative patches. Convert old `s.endpoint(...).insert(...)` imperatives to patches with `data: [...]`. Convert dual-method same-URL pattern to single entry with `methods` map.

```ts
// examples/auth-api/server.ts
import { mockr, handler, auth, delay, logger } from '../../src/index.js';

interface User { id: number; name: string; email: string; role: string; }

type Endpoints = { '/internal/users': User[]; };

const server = await mockr<Endpoints>({
  port: 3003,
  middleware: [
    logger(),
    delay({ min: 50, max: 150 }),
    auth({
      type: 'bearer',
      validate: (token) => token === 'admin-token-123' || token === 'user-token-456',
      exclude: ['/api/health', '/api/login'],
    }),
  ],
  endpoints: [
    { url: '/api/health', handler: handler({ fn: () => ({ body: { status: 'ok', version: '1.0.0' } }) }) },

    {
      url: '/api/login',
      method: 'POST',
      handler: handler({
        fn: (req) => {
          const { email, password } = req.body as { email: string; password: string };
          if (email === 'admin@example.com' && password === 'admin') {
            return { body: { token: 'admin-token-123', role: 'admin' } };
          }
          if (email === 'user@example.com' && password === 'pass') {
            return { body: { token: 'user-token-456', role: 'viewer' } };
          }
          return { status: 401, body: { error: 'Invalid credentials' } };
        },
      }),
    },

    {
      url: '/internal/users',
      data: [
        { id: 1, name: 'Alice', email: 'alice@example.com', role: 'admin' },
        { id: 2, name: 'Bob', email: 'bob@example.com', role: 'viewer' },
        { id: 3, name: 'Charlie', email: 'charlie@example.com', role: 'editor' },
      ],
    },

    {
      url: '/api/users',
      method: 'GET',
      handler: handler({
        fn: (req, ctx) => {
          const role = req.query.role as string | undefined;
          const users = ctx.endpoint('/internal/users');
          const items = role ? users.where((u) => u.role === role) : users.data;
          return { body: { users: items } };
        },
      }),
    },

    {
      url: '/api/me',
      method: 'GET',
      handler: handler({
        fn: (req) => {
          const authHeader = (req.headers.authorization as string) ?? '';
          const token = authHeader.replace('Bearer ', '');
          if (token === 'admin-token-123') return { body: { name: 'Admin', role: 'admin' } };
          return { body: { name: 'Regular User', role: 'viewer' } };
        },
      }),
    },
  ],

  scenarios: {
    empty: () => ({ '/internal/users': { data: [] } }),
    crowded: ({ baseline }) => ({
      '/internal/users': {
        data: [
          ...baseline('/internal/users'),
          { id: 4, name: 'Dana', email: 'dana@example.com', role: 'editor' },
          { id: 5, name: 'Eve', email: 'eve@example.com', role: 'admin' },
          { id: 6, name: 'Frank', email: 'frank@example.com', role: 'viewer' },
        ],
      },
    }),
    down: () => ({
      '/internal/users': {
        handler: handler({ fn: () => ({ status: 503, body: { error: 'Service temporarily unavailable' } }) }),
      },
    }),
  },
});

server.use({
  name: 'admin-only-delete',
  pre: (req) => {
    if (req.method === 'DELETE') {
      const token = ((req.headers.authorization as string) ?? '').replace('Bearer ', '');
      if (token !== 'admin-token-123') return { status: 403, body: { error: 'Only admins can delete' } };
    }
  },
});

console.log(`Auth API running at ${server.url}`);
```

- [ ] **Step 4: Update `examples/ecommerce/server.ts`** to use the `methods` map for `/api/cart`

```ts
// examples/ecommerce/server.ts
import { mockr, handler } from '../../src/index.js';

interface Product { id: number; name: string; price: number; category: string; stock: number; }
interface CartItem { id: number; product_id: number; quantity: number; }

type Endpoints = {
  '/internal/products': Product[];
  '/internal/cart': CartItem[];
};

const server = await mockr<Endpoints>({
  port: 3002,
  endpoints: [
    {
      url: '/internal/products',
      dataFile: new URL('./products.json', import.meta.url).pathname,
    },
    { url: '/internal/cart', data: [] },

    {
      url: '/api/products',
      method: 'GET',
      handler: handler({
        fn: (req, ctx) => {
          const products = ctx.endpoint('/internal/products');
          let items = products.data;
          const category = req.query.category as string | undefined;
          if (category) items = items.filter((p) => p.category === category);
          const maxPrice = req.query.maxPrice as string | undefined;
          if (maxPrice) items = items.filter((p) => p.price <= Number(maxPrice));
          return { body: { products: items, count: items.length } };
        },
      }),
    },

    {
      url: '/api/cart',
      methods: {
        GET: handler({
          fn: (_req, ctx) => {
            const products = ctx.endpoint('/internal/products');
            const cart = ctx.endpoint('/internal/cart');
            const items = cart.data.map((item) => {
              const product = products.findById(item.product_id);
              return {
                ...item,
                product_name: product?.name ?? 'Unknown',
                unit_price: product?.price ?? 0,
                subtotal: (product?.price ?? 0) * item.quantity,
              };
            });
            const total = items.reduce((sum, i) => sum + i.subtotal, 0);
            return { body: { items, total } };
          },
        }),
        POST: handler({
          fn: (req, ctx) => {
            const { product_id, quantity } = req.body as { product_id: number; quantity: number };
            const products = ctx.endpoint('/internal/products');
            const cart = ctx.endpoint('/internal/cart');
            const product = products.findById(product_id);
            if (!product) return { status: 404, body: { error: `Product ${product_id} not found` } };
            if (product.stock < quantity) return { status: 400, body: { error: `Only ${product.stock} in stock` } };
            products.update(product_id, { stock: product.stock - quantity });
            const existing = cart.where((item) => item.product_id === product_id)[0];
            if (existing) {
              cart.update(existing.id, { quantity: existing.quantity + quantity });
              return { body: { item: cart.findById(existing.id) } };
            }
            const item = cart.insert({ product_id, quantity } as CartItem);
            return { status: 201, body: { item } };
          },
        }),
      },
    },
  ],
});

console.log(`E-commerce API running at ${server.url}`);
```

- [ ] **Step 5: Update remaining examples** (`chat`, `proxy`) and `playground/server.ts` with the same pattern: wrap every `handler` in `handler({ fn })`, rename `ctx.endpoints` → `ctx.endpoint`, replace `body:` (response) with `data:` for record endpoints, replace `response: { status, body }` with `handler: handler({ fn: () => ({ status, body }) })`.

- [ ] **Step 6: Run examples to confirm they boot**

```bash
npx tsx examples/todo/server.ts &
PID=$!
sleep 1
curl http://localhost:3001/api/todos | head -c 200 ; echo
kill $PID
```
Expected: 200 response with the seeded todos.

Repeat for at least one other example (auth-api or ecommerce).

- [ ] **Step 7: Commit**

```bash
git add examples/ playground/
git commit -m "refactor(examples): migrate to v0.3.0 API"
```

---

### Task 18: Update tests to new shape

**Why:** Existing level-* tests use old endpoint shapes. They must run green against the new API.

**Files:**
- Modify: `tests/level-*.test.ts` (run them, fix one at a time)

- [ ] **Step 1: Run the full suite, capture failures**

```bash
npm test 2>&1 | tee /tmp/test-fails.log
grep -E "FAIL|✗" /tmp/test-fails.log | head -50
```

- [ ] **Step 2: For each failing test file, apply the same migrations as in examples:**
- Wrap raw handler functions in `handler({ fn })`.
- Rename `ctx.endpoints` → `ctx.endpoint`.
- Replace top-level `body:` (when used as response shorthand) with `data:` (record) or `handler: handler({ fn: () => ({ body }) })`.
- Replace `response: { status, body }` with `handler: handler({ fn: () => ({ status, body }) })`.
- Replace dual-method-on-same-URL with single entry + `methods` map (where it makes sense).
- Replace scenario imperatives with declarative patches.

- [ ] **Step 3: Run after each file fix**

```bash
npx vitest run tests/level-N.test.ts
```

- [ ] **Step 4: After all fixed, run the full suite**

```bash
npm test
```
Expected: PASS.

- [ ] **Step 5: Commit per logical batch**

```bash
git add tests/level-*.test.ts
git commit -m "test: migrate level-* tests to v0.3.0 API"
```

---

### Task 19: Update control-routes / recorder / server-file-patcher emit

**Why:** The Chrome extension calls `/__mockr/map` to write recorded entries into the user's server file. The patcher must emit the new shape (`data` not `body`, `handler({...})` factory call, `methods` map for multi-verb URLs, `file<T>(...)` for typed dataFile).

**Files:**
- Modify: `src/server-file-patcher.ts` (the AST builder that emits endpoint def code)
- Modify: `src/control-routes.ts` (where it formats responses describing endpoints)
- Modify: `src/recorder.ts` (if it constructs def shapes)

- [ ] **Step 1: Write a regression test**

```ts
// tests/server-file-patcher.test.ts (extend existing if present)
import { describe, it, expect } from 'vitest';
import { addEndpointToServerFile } from '../src/server-file-patcher.js';
// or whatever the entrypoint is — engineer adapts

describe('server-file-patcher v0.3.0 emit', () => {
  it('emits data, not body, for static endpoints', () => {
    const out = addEndpointToServerFile(/* args */);
    expect(out).toContain("data:");
    expect(out).not.toContain("body:");
  });

  it('emits handler({...}) factory for handlers', () => {
    const out = addEndpointToServerFile(/* args */);
    expect(out).toMatch(/handler\(\s*\{/);
  });
});
```

(Engineer should examine the existing `tests/server-file-patcher.test.ts` to fit the regression check into existing structure.)

- [ ] **Step 2: Run test**

```bash
npx vitest run tests/server-file-patcher.test.ts
```
Expected: FAIL until the patcher emits new shapes.

- [ ] **Step 3: Update emit logic**

In `src/server-file-patcher.ts`, find every place that constructs an endpoint def AST node. Replace `body: ...` (response shorthand) emission with `data: ...` (when the recorded body is an object) or emit a `handler({ fn: () => ({ body: ... }) })` wrapper for handler shapes. Replace any raw-function emission with `handler({ fn: ... })`. Replace `dataFile: '...'` with `dataFile: file<T>('./...')` when a type can be inferred from the recorded body.

- [ ] **Step 4: Run test**

```bash
npx vitest run tests/server-file-patcher.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server-file-patcher.ts src/control-routes.ts src/recorder.ts tests/server-file-patcher.test.ts
git commit -m "refactor: server-file-patcher emits v0.3.0 endpoint shape"
```

---

### Task 20: Type-level tests for new API

**Why:** Lock in the type contracts: conditional `EndpointHandle`, `endpoints<T>()` URL/data enforcement, `handler({...})` schema-to-req inference.

**Files:**
- Create: `tests/api-redesign.test-d.ts`

- [ ] **Step 1: Write type tests**

```ts
// tests/api-redesign.test-d.ts
import { describe, it, expectTypeOf } from 'vitest';
import { mockr, endpoints, handler, file } from '../src/index.js';
import type { ListHandle, RecordHandle } from '../src/index.js';

describe('v0.3.0 type contracts', () => {
  it('list endpoint produces ListHandle', async () => {
    type E = { '/users': { id: number; name: string }[] };
    const server = await mockr<E>({ port: 0, endpoints: [{ url: '/users', data: [] }] });
    type H = ReturnType<typeof server.endpoint<'/users'>>;
    expectTypeOf<H>().toMatchTypeOf<ListHandle<{ id: number; name: string }>>();
    await server.close();
  });

  it('record endpoint produces RecordHandle', async () => {
    type E = { '/config': { theme: string } };
    const server = await mockr<E>({ port: 0, endpoints: [{ url: '/config', data: { theme: 'dark' } }] });
    type H = ReturnType<typeof server.endpoint<'/config'>>;
    expectTypeOf<H>().toMatchTypeOf<RecordHandle<{ theme: string }>>();
    await server.close();
  });

  it('endpoints<T>() rejects URLs not in T', () => {
    type E = { '/users': { id: number }[] };
    // @ts-expect-error '/posts' not in E
    endpoints<E>([{ url: '/posts', data: [] }]);
  });

  it('handler({ body: schema }) types req.body', () => {
    const z = { safeParse: (d: unknown) => ({ success: true as const, data: d as { name: string } }) };
    handler({
      body: z,
      fn: (req) => {
        expectTypeOf(req.body).toEqualTypeOf<{ name: string }>();
        return { body: {} };
      },
    });
  });

  it('file<T>() carries the type', () => {
    const ref = file<{ id: number }[]>('./x.json');
    expectTypeOf(ref).toMatchTypeOf<{ path: string }>();
  });
});
```

- [ ] **Step 2: Run type tests**

```bash
npx vitest run --config vitest.typecheck.config.ts tests/api-redesign.test-d.ts
```
Expected: PASS, 5 tests. If any fail with type errors, adjust the inferred types in `src/types.ts` or `src/handler.ts` until they match.

- [ ] **Step 3: Commit**

```bash
git add tests/api-redesign.test-d.ts
git commit -m "test: type contracts for v0.3.0 API"
```

---

### Task 21: Rewrite README

**Why:** README is the junior FE dev's first 5 minutes. It must show the new API exclusively.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Outline new README structure**

Sections, in order:
1. **Setup** — `npm install`, `tsx` runner.
2. **Quick example** — todo app, single `data` array, full CRUD.
3. **The four building blocks** — `data` (list & record), `dataFile`, `handler`, `methods`.
4. **Hot reload** — change the JSON file, server picks it up.
5. **Validation** — `handler({ body: zodSchema })`, get `req.body` typed.
6. **Cross-endpoint** — `ctx.endpoint('/internal/x').data`.
7. **Multi-verb** — `methods: { GET, POST, ... }`.
8. **Scenarios** — declarative, with `baseline()`.
9. **Grouping mocks across files** — `endpoints<T>()`, intersection at top-level.
10. **Typed dataFile** — `file<T>('./x.json')`.
11. **Chrome extension — Record & Map** — keep mostly as-is, update sample emitted code.
12. **CLI options** — keep as-is.
13. **API reference** — `mockr<E>()`, `ListHandle`, `RecordHandle`, `MockrServer`.
14. **License**.

- [ ] **Step 2: Rewrite each section**

Use the new examples directly. Avoid showing the old `body: {...}` shorthand anywhere. Every handler example uses `handler({...})`. Cross-endpoint uses `ctx.endpoint`.

(The full README content is too long to inline here verbatim; write it directly in the file using the example patterns from Tasks 17 and 20 as the source of truth.)

- [ ] **Step 3: Verify links**

```bash
grep -n "examples/" README.md
ls examples/
```
Confirm every linked example file exists.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for v0.3.0 API"
```

---

### Task 22: Bump version, final smoke

**Files:**
- Modify: `package.json` (version)

- [ ] **Step 1: Bump version**

```bash
npm version 0.3.0 --no-git-tag-version
```

- [ ] **Step 2: Run full suite**

```bash
npm test
```
Expected: All tests pass — runtime + typecheck.

- [ ] **Step 3: Run examples manually**

```bash
for ex in todo auth-api ecommerce; do
  npx tsx examples/$ex/server.ts &
  PID=$!
  sleep 1
  case $ex in
    todo)      curl -s http://localhost:3001/api/todos    | head -c 100 ; echo ;;
    auth-api)  curl -s http://localhost:3003/api/health   | head -c 100 ; echo ;;
    ecommerce) curl -s http://localhost:3002/api/products | head -c 100 ; echo ;;
  esac
  kill $PID
  wait $PID 2>/dev/null
done
```

- [ ] **Step 4: Build the package**

```bash
npm run build
```
Expected: `dist/` populated. No type errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: bump version to 0.3.0"
```

---

## Self-review checklist for the engineer

Before marking the plan complete, verify each of these:

- [ ] `EndpointDef` has exactly 3 base forms (`data`, `dataFile`, `handler`) plus `methods` overlay.
- [ ] `body` field on `EndpointDef` is rejected at runtime by validator.
- [ ] `response` field on `EndpointDef` is rejected at runtime by validator.
- [ ] `handler` field rejects raw functions; only `handler({...})` factory results pass.
- [ ] `ctx.endpoint(url)` works inside handlers; `ctx.endpoints` no longer exists.
- [ ] List endpoints (`data: T[]`) produce `ListHandle<T>` at type and runtime.
- [ ] Record endpoints (`data: T`) produce `RecordHandle<T>` at type and runtime.
- [ ] `dataFile` hot-reload works: edit file → endpoint reflects new content within 200ms.
- [ ] Bad JSON during hot-reload keeps the last good copy and logs an error.
- [ ] Boot validation aggregates and throws on: unknown keys, conflicting forms, raw-function handlers, malformed methods map, duplicate URL+method.
- [ ] Scenarios are declarative; `baseline(url)` returns the original data.
- [ ] `idKey` warning fires when items lack the configured field.
- [ ] All examples boot and respond on their documented endpoints.
- [ ] All level-* tests pass.
- [ ] Type tests in `tests/api-redesign.test-d.ts` pass.
- [ ] README's first three examples can be copy-pasted into a new project and run.

---

## Out of scope reminders

- **Memory replay sessions** (`server.sessions`) — not touched by this plan; the existing `memory-session.ts` is left alone.
- **Recorder/extension internals** — only the emitted shape (`server-file-patcher.ts` emit) is updated; recorder logic itself is untouched.
- **Middleware shape** (`{ name, pre, post }`) — unchanged.
- **CLI flags** — unchanged.
