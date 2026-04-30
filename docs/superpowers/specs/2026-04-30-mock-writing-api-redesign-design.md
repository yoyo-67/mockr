# Mock-writing API redesign (v0.3.0)

## Problem

Current mockr API has accumulated ~10 ergonomic papercuts that confuse junior frontend devs writing mocks for the first time:

1. README and examples disagree on `Endpoints` type shape (`Item[]` vs `Item`).
2. `body` field on `EndpointDef` means response state, but `req.body` means request payload — same word, opposite directions.
3. Five mutually-exclusive endpoint forms (`body`, `response`, `data`, `dataFile`, `handler`) with silent failure on accidental mixing.
4. Two handler styles (raw function vs `handler({...})` factory). Raw style requires `as` casts; junior copies it from auth-api example and never finds the validated form.
5. Multi-method endpoints require separate array entries per verb. Junior expects one block per URL.
6. `ctx.endpoints(url)` (plural) returns a single handle. Inconsistent with `server.endpoint(url)` (singular).
7. Scenarios swap behavior via direct property assignment (`s.endpoint(url).handler = fn`). Not in README, not discoverable.
8. No JSDoc on public types — IDE hover is silent.
9. `idKey` default ('id') silent — fallback to array index when field missing causes mysterious bugs.
10. Bad config (typo'd key, conflicting forms, duplicate URL+method) silently misregisters; junior debugs for hours.

Target user is a **junior frontend dev mocking an unfinished backend during feature work**. Five-minute onboard. No zod required for trivial cases. Copy-paste from network tab works.

Pre-1.0 (v0.2.0), no external users — breaking changes are free. Ship as v0.3.0.

## Out of scope

- In-memory replay sessions (`server.sessions`) — already in flight, treated as separate concern.
- Recorder/extension internals — only the surface they generate (mapped endpoints) is affected.
- Middleware shape — current `{ name, pre, post }` is fine.

## Design

### Endpoint definition: 3 base fields + `methods` overlay

```ts
type EndpointDef =
  | { url: string | RegExp; method?: string; data:     T[] | T;            methods?: MethodMap }
  | { url: string | RegExp; method?: string; dataFile: BrandedPath;        methods?: MethodMap }
  | { url: string | RegExp; method?: string; handler:  HandlerFactoryResult                    }
  | { url: string | RegExp;                                                methods:  MethodMap };
```

Three base fields are mutually exclusive: `data`, `dataFile`, `handler`. `methods` is an overlay that may sit alongside `data` or `dataFile` (overrides specific verbs while default CRUD covers the rest). `methods` may also stand alone (all verbs explicit, no data store). 

Conflict matrix (boot-time validation rejects):
- `data` + `dataFile`
- `data` + `handler`
- `dataFile` + `handler`
- `handler` + `methods`
- `method` + `methods` (use one or the other)

Top-level `method` field is shorthand for single-verb endpoints with `data`/`dataFile`/`handler`. Multi-verb requires `methods`.

### Single `data` field for both list and record

Shape decides behavior:
- `data: T[]` (array) → **list endpoint**: handle exposes `findById`, `where`, `first`, `count`, `has`, `insert`, `nextId`, `update`, `updateMany`, `patch`, `remove`, `clear`, `reset`.
- `data: T` (non-array object) → **record endpoint**: handle exposes `set(patch)`, `replace(obj)`, `reset`.

`EndpointHandle<T>` becomes a TS conditional:
```ts
type EndpointHandle<T> = T extends readonly any[] ? ListHandle<T> : RecordHandle<T>;
```

`Endpoints` map drives the kind: `'/api/todos': Todo[]` → list; `'/api/config': Config` → record. The `body`/`response` forms are removed; record endpoints replace them.

`body` is now reserved exclusively for request-side: `req.body` (runtime) and `handler({ body: zodSchema })` (validation slot).

### `dataFile` with `file<T>()` factory

```ts
import { file } from '@yoyo-org/mockr';

{ url: '/internal/alerts', dataFile: file<Alert[]>('./alerts.json') }
```

`file<T>(path)` returns a branded `string` at runtime; the generic carries the type so the handle is typed even though JSON content is unknown at compile time. No `import alerts from './x.json'` (which would defeat hot-reload).

#### Hot-reload semantics
- `fs.watch(path)` per `dataFile` endpoint, always on.
- 100ms debounce on filesystem events.
- File change → **reset** state to file content. In-memory mutations are dropped. Junior intuition: "file changed, that's the truth now."
- Bad JSON on reload → log error, keep last good copy, do not crash.

### `handler({...})` is always a factory call

```ts
import { handler } from '@yoyo-org/mockr';
import { z } from 'zod';

handler({
  body?:   ZodSchema,
  query?:  ZodSchema,
  params?: ZodSchema,
  fn:      (req, ctx) => HandlerResult | Promise<HandlerResult>,
})
```

No raw-function shorthand. Schemas at the slot level flow into `fn`'s `req` so `req.body` / `req.query` / `req.params` are typed without manual generics or casts. The slight cost (one extra wrapper + one import per handler) is accepted in exchange for a single shape across the codebase.

Trivial handler:
```ts
handler({ fn: (req, ctx) => ({ body: { ok: true } }) })
```

Validated:
```ts
handler({
  body: z.object({ id: z.number() }),
  fn: (req, ctx) => {
    ctx.endpoint('/internal/orders').update(req.body.id, { status: 'shipped' });
    return { body: { ok: true } };
  },
})
```

### Multi-method: `methods` map per URL

```ts
{
  url: '/api/cart',
  methods: {
    GET:  handler({ fn: (req, ctx) => ({ body: ctx.endpoint('/internal/cart').data }) }),
    POST: handler({
      body: z.object({ product_id: z.number(), quantity: z.number() }),
      fn: (req, ctx) => { /* ... */ },
    }),
  },
}
```

Single entry per URL. `data` / `dataFile` provides default CRUD on verbs not present in `methods`; `methods` overrides specific verbs. `methods` keys are uppercase HTTP verbs.

### Cross-endpoint access: `ctx.endpoint(url)` (singular)

Matches `server.endpoint(url)`. Plural `ctx.endpoints` removed.

### `endpoints<T>()` helper for grouping

```ts
// src/mocks/cart.ts
import { endpoints, handler } from '@yoyo-org/mockr';
import { z } from 'zod';

type CartEndpoints = {
  '/internal/cart': CartItem[];
};

export const cartMocks = endpoints<CartEndpoints>([
  { url: '/internal/cart', data: [] },
  {
    url: '/api/cart',
    methods: {
      GET:  handler({ fn: (req, ctx) => ({ body: ctx.endpoint('/internal/cart').data }) }),
      POST: handler({
        body: z.object({ product_id: z.number(), quantity: z.number() }),
        fn: (req, ctx) => {
          ctx.endpoint('/internal/cart').insert({ product_id: req.body.product_id, quantity: req.body.quantity });
          return { body: { ok: true } };
        },
      }),
    },
  },
]);
```

`endpoints<T>(defs)`:
- Runtime: returns `defs` unchanged. No-op wrapper.
- Type-level: each item's URL must appear in `T`; `data` must match `T[url]`; `ctx.endpoint(url)` inside group handlers is typed against `T`.

Compose multiple groups at top level via intersection:
```ts
// src/server.ts
type Endpoints = CartEndpoints & BatchMonitorEndpoints;

await mockr<Endpoints>({
  port: 3000,
  endpoints: [...cartMocks, ...batchMonitorMocks],
});
```

`mockr<T>` keeps its explicit generic — top-level `Endpoints` map stays declared, not inferred.

### Scenarios: declarative

```ts
scenarios: {
  empty:   () => ({ '/internal/users': { data: [] } }),
  crowded: ({ baseline }) => ({
    '/internal/users': {
      data: [
        ...baseline('/internal/users'),
        { id: 4, name: 'Dana', email: 'd@x', role: 'editor' },
      ],
    },
  }),
  down: () => ({
    '/internal/users': {
      handler: handler({ fn: () => ({ status: 503, body: { error: 'down' } }) }),
    },
  }),
}
```

A scenario is a function returning `{ [url]: EndpointDefPatch }`. Patch shape is the subset of `EndpointDef` (`data`, `dataFile`, `handler`, `methods`). The `baseline(url)` helper returns the original data declared at startup, used when the scenario extends rather than replaces.

No imperative `.insert()` / `.clear()` calls inside scenarios. No `handle.handler = fn` assignment.

### `idKey` defaults

Default is `'id'`, overridable per endpoint with `idKey: 'foo'`. New: at startup, if a `data: T[]` endpoint has zero items containing the configured `idKey`, log a warning identifying the endpoint and the missing field. The fallback (array index) is preserved for backward compatibility but no longer silent.

### Boot-time config validation

`mockr({...})` validates the entire config before opening the port. On any failure, throws a single aggregated error listing every bad def by index + URL.

Validations:
- Unknown keys on `EndpointDef` (with did-you-mean for typos like `dataFiel`).
- Conflicting form fields (`data` + `handler`, `data` + `dataFile`, etc.).
- `dataFile` path missing on disk (deferred check; warning if `dataFile: file('./missing.json')`).
- Duplicate URL+method across array entries.
- Malformed `methods` map (non-uppercase keys, non-handler-factory values).
- `handler` field receiving a raw function (must be `handler({...})` factory result).

Error message example:
```
mockr: 3 endpoint definitions invalid:
  [0] /api/orders: 'dataFiel' is not a known key (did you mean 'dataFile'?)
  [2] /api/login: cannot set both 'data' and 'handler'
  [5] /api/users (GET): duplicate URL+method (also at index 7)
```

## Architecture changes

### Files affected

- `src/types.ts` — `EndpointDef` collapsed to 3 forms; `EndpointHandle<T>` made conditional on `T extends any[]`; `body`/`response` form removed; `MockrConfig.scenarios` shape changed; new `RecordHandle<T>` type; new `MethodMap` type; `HandlerFactoryResult` brand.
- `src/server.ts` — Endpoint registration switched from chained conditional to discriminated-union dispatch (one function per kind). Handler invocation always unwraps factory result. Removes `(def as any).idKey`, `def.data as unknown[]`, `(req as any).body/.query/.params` casts. Adds boot-time validation pass.
- `src/endpoint-handle.ts` — Splits into `list-handle.ts` (CRUD) and `record-handle.ts` (`set`, `replace`, `reset`). Factory function picks one based on `Array.isArray(data)`.
- `src/index.ts` — New exports: `endpoints<T>()`, `file<T>()`, `RecordHandle`, `ListHandle`. Removes raw-function handler escape hatch.
- `src/data-file-watcher.ts` — New module. Owns `fs.watch` + 100ms debounce + reset-on-change + keep-last-good logic. Each `dataFile` endpoint registers a watcher on startup; closed on `server.close()`.
- `src/scenarios.ts` — New module. Applies declarative scenario patches: replaces `data`, swaps `handler`, swaps `methods` map. Holds the `baseline(url)` snapshot map, populated once at startup.
- `src/config-validator.ts` — New module. Pre-flight pass over `MockrConfig.endpoints`. Returns `{ valid: true } | { valid: false; errors: ConfigError[] }`. Mockr boot calls it before binding the port.
- `src/handler.ts` — Rename `ValidatedHandler` to internal `HandlerSpec`. `handler({...})` factory produces a brand to make "handler must be factory result" enforceable at boot.
- `src/control-routes.ts`, `src/recorder.ts`, `src/server-file-patcher.ts` — Mapped endpoint output adjusted to match new shape (single `data` field; `handler` always factory).
- `examples/*/server.ts` — Rewritten to new shape.
- `playground/server.ts` — Rewritten.
- `tests/*` — Updated; type tests cover new conditional handle.
- `README.md` — Rewritten around junior FE narrative.

### Module boundaries

- **`config-validator.ts`** — Pure: `(config) → result`. No I/O. Easy to unit-test edge cases.
- **`data-file-watcher.ts`** — Owns `fs.watch` lifecycle. `register(path, onChange)` + `closeAll()`. Server passes a callback that resets the relevant handle.
- **`scenarios.ts`** — Owns baseline snapshots + patch application. Server holds reference, calls `apply(name)`. Pure transformation.
- **`list-handle.ts` / `record-handle.ts`** — Owns mutation. Each module is small and testable in isolation.

These boundaries replace today's overgrown `server.ts` (~500 lines, mixed concerns) with focused modules each one fits on a screen.

## Migration

User-visible breaks (each example):

| Today | v0.3.0 |
|---|---|
| `{ url, body: {...} }` | `{ url, data: {...} }` (record) |
| `{ url, response: { status, body } }` | `{ url, handler: handler({ fn: () => ({ status, body }) }) }` |
| `{ url, method:'GET', handler: ... }, { url, method:'POST', handler: ... }` | `{ url, methods: { GET: handler({...}), POST: handler({...}) } }` |
| `handler: (req, ctx) => ...` | `handler: handler({ fn: (req, ctx) => ... })` |
| `req.body as { x: number }` | `handler({ body: z.object({ x: z.number() }), fn: (req) => req.body.x })` |
| `ctx.endpoints('/x')` | `ctx.endpoint('/x')` |
| `dataFile: './x.json'` (untyped) | `dataFile: file<T>('./x.json')` |
| `mockr<Endpoints>({ endpoints: [...] })` | unchanged |
| `scenarios: { foo: (s) => { s.endpoint('/x').handler = fn; } }` | `scenarios: { foo: () => ({ '/x': { handler: handler({...}) } }) }` |

Migration is mechanical; a codemod is feasible but not required for v0.3.0 (no external users).

## Testing strategy

- **Unit**: `config-validator.ts` exhaustive coverage (every error class).
- **Unit**: `list-handle` / `record-handle` — verify shape narrowing at runtime + return types.
- **Unit**: `data-file-watcher` with `fs.watch` mocked — debounce, reset, keep-last-good on bad JSON.
- **Unit**: `scenarios` — patch application, `baseline` helper.
- **Type tests** (`tests/types.test-d.ts`): assert `EndpointHandle<T[]>` is `ListHandle`, `EndpointHandle<T>` is `RecordHandle`. `endpoints<T>()` rejects extra URLs / wrong data shape.
- **Integration**: every example server boots, every endpoint roundtrips, hot-reload works (write file mid-test).
- **Existing tests** updated; nothing dropped.

## Open questions

None at design time. Implementation may surface edge cases — those become plan checkpoints, not redesigns.
