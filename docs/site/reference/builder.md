# Builder reference

`mockGroup<Endpoints>()` is the primary way to define mocks. It's typed against
your `Endpoints` map: every call infers the response body from the URL, path
params from the `:name` segments, and types `ctx` — no generics, no casts.

```ts
import { mockr, mockGroup } from '@yoyo-org/mockr';

const todos = mockGroup<Endpoints>()
  .data('/internal/todos', [{ id: 1, title: 'Buy milk', done: false }])
  .get('/api/todos', (_req, ctx) => ctx.endpoint('/internal/todos').data)
  .done();

await mockr({ port: 4000, groups: [todos] });
```

## Methods

| Method | Purpose |
|---|---|
| `.get/.post/.put/.patch/.delete(url, def)` | Register a handler for `url` (a key of `Endpoints`). `def` is a function or a [verb spec](#verb-spec). |
| `.data(url, seed)` | In-memory store, seeded + typed by the map. Array ⇒ list (full CRUD); object ⇒ record. |
| `.data(url, hydrate(loader))` | Store filled **once** from `loader` on first read, then owned — local CRUD mutations stick. See [Hydrate](#hydrate). |
| `.prefix(p)` | Scope later registrations under prefix `p`; sub-paths are constrained so `p + sub` is a key of `Endpoints`. Composable. |
| `.done()` | Return `EndpointDef[]` for `mockr({ groups })` (or `endpoints`). |

Multiple verbs on the same URL merge into one endpoint at `.done()`. Registering the same verb+URL twice throws.

```ts
mockGroup<Endpoints>()
  .get('/api/cart', (_req, ctx) => ctx.endpoint('/internal/cart').data)
  .post('/api/cart', { body: z.object({ id: z.number() }), fn: (req, ctx) => {
    ctx.endpoint('/internal/cart').insert(req.body);
    return ctx.endpoint('/internal/cart').data;
  } })
  .done();
```

### `.prefix()`

```ts
mockGroup<Endpoints>()
  .prefix('/api/v1/projects')
  .get('/', (_req, ctx) => ctx.endpoint('/internal/projects').data)   // → /api/v1/projects/
  .get('/:id/stats/', (req) => ({ project_id: req.params.id, progress: 87 }))
  .done();
```

## Hydrate

Wrap a `.data` loader in `hydrate(...)` to **seed the store from upstream (or a file, or inline) once**, then own it. The first read runs the loader and fills the store; later reads serve the store; `POST`/`PUT`/`PATCH`/`DELETE` mutate it and the changes stick.

```ts
import { mockr, mockGroup, hydrate } from '@yoyo-org/mockr';

const api = mockGroup<{ '/api/todos': Todo[] }>()
  // fetch the real list once, then it's a local mutable store
  .data('/api/todos', hydrate((_req, ctx) => ctx.forward<Todo[]>().then((r) => r.body)))
  .done();

await mockr({ proxy: { target: 'https://api.example.com' }, groups: [api] });
```

```
GET  /api/todos  → forwards upstream once → [A, B]          (owned)
POST /api/todos  → default CRUD append    → [A, B, C]
GET  /api/todos  → serves the store, NO re-forward → [A, B, C]
```

- **Without `hydrate`**, a loader runs every request (live; mutations are clobbered on the next read).
- The loader gets the full `ctx` (incl. `ctx.forward()`) — **proxy-agnostic**: it can read a file or return inline data instead.
- A write *before* the first read latches ownership without loading (your write wins; upstream isn't fetched).
- `server.endpoint(url).reset()` re-arms — the next read re-loads.
- Concurrent first reads share one in-flight load (the loader runs exactly once).

Distinct from a [mem-session](/reference/recorder) (a global, immutable record/replay cache) — `hydrate` produces owned, CRUD-mutable endpoint data, latched per-endpoint until `reset()`.

## Handler return

Return the **body directly** — it's checked against the URL's type:

```ts
.get('/api/todos', () => [{ id: 1, title: 'a', done: false }])
```

Return an object with `status` / `headers` / `raw` for control, or use the `ctx` shorthands:

```ts
.get('/api/todos/:id', (req, ctx) =>
  req.params.id === '0' ? ctx.error(404, 'not found') : { id: 1, title: 'a', done: false })
```

| `ctx` shorthand | Result |
|---|---|
| `ctx.error(status, message?)` | `{ status, body: message ? { error: message } : undefined }` |
| `ctx.created(body)` | `{ status: 201, body }` |
| `ctx.noContent()` | `{ status: 204 }` |

> If a response body itself has a top-level `body` or `raw` key, wrap it: `() => ({ body: payload })`.

## Verb spec

Pass an object instead of a function for schemas, delay, contract, or scenarios:

```ts
.get('/api/projects/:projectId/stats/', {
  query: z.object({ unit: z.enum(['percent', 'count']).optional() }),
  delay: 200,
  responseSchema: z.object({ project_id: z.string(), progress: z.number() }),
  scenarios: {
    empty: (req) => ({ project_id: req.params.projectId, progress: 0 }),
    error: (_req, ctx) => ctx.error(503, 'unavailable'),
  },
  fn: (req) => ({ project_id: req.params.projectId, progress: req.query.unit === 'count' ? 42 : 87 }),
})
```

| Field | Description |
|---|---|
| `body` / `query` / `params` | Zod (or any `safeParse`) schema. Output flows into `req.body` / `req.query` / `req.params`. |
| `delay` | `number` ms, or `{ min, max }` jitter, before the handler runs. |
| `responseSchema` | Contract checked against the served body under [`verify`](/reference/verify). |
| `scenarios` | Named alternates, switched per request — see [Scenarios](/reference/scenarios). |
| `fn` | The handler. |

When no `params` schema is given, `req.params` is typed from the URL's `:name` segments. For JSON-encoded query params, use [`jsonParam` / `jsonArrayParam`](/reference/query-params) inside the `query` schema.

## Composition

Each group shares one `Endpoints` map, so they compose without widening:

```ts
// endpoints.ts — declare the map once
export type Endpoints = EnterpriseEndpoints & ProjectAdminEndpoints & {
  '/internal/users': User[];   // cross-group store, declared once
};

// server.ts
await mockr({ groups: [enterpriseMocks, projectAdminMocks] });
```

`ctx.endpoint('/internal/users')` is typed in every group because the key lives in the shared map.
