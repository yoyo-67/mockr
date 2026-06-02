# Concepts

The mental model is small. Read this once, then jump to [tutorial](/tutorial/) or [reference](/reference/).

## Author with the builder

`mockGroup<Endpoints>()` is the way you define mocks. It's typed against your `Endpoints` map, so each call infers the response body from the URL, path params from the `:name` segments, and types `ctx` — no generics, no casts. `.done()` produces the endpoint list you hand to `mockr({ groups })`.

```ts
import { mockr, mockGroup } from '@yoyo-org/mockr';

const orders = mockGroup<Endpoints>()
  .data('/internal/orders', [/* the data */])                 // in-memory store, free CRUD
  .get('/api/orders', (_req, ctx) => ctx.endpoint('/internal/orders').data) // return body directly
  .done();

await mockr({ port: 4000, groups: [orders] });
```

Return the body directly, or `{ status, body }` for a custom status, or `ctx.error/created/noContent(...)`.

## Endpoints are named data holders

Every endpoint has a URL and a behavior picked by how you declare it — no glue code:

| Declaration | Endpoint type | Verbs handled |
|---|---|---|
| `.data(url, T[])` | List | GET / POST / PUT / PATCH / DELETE |
| `.data(url, T)` (object) | Record | GET / PATCH / PUT |
| `.get/.post/...(url, fn)` | Hand-rolled | The verb you call |
| `{ url, dataFile: file<T>('./x.json') }` | Inferred from JSON shape | List/record + hot-reload |
| `{ url, ws: ws({...}) }` | WebSocket | n/a — upgrade |

Mutations on list / record endpoints persist in memory across requests. `server.reset()` restores baselines. File-backed (`dataFile`) and WebSocket (`ws`) endpoints are plain defs you pass in `endpoints: [...]` — the builder covers handlers and in-memory stores.

## `/internal/*` vs `/api/*`

A convention, not a rule. `/internal/*` endpoints hold source-of-truth data. `/api/*` endpoints are thin handlers that join, filter, or mutate them via `ctx.endpoint(url)`. The frontend only calls `/api/*`.

```ts
mockGroup<Endpoints>()
  .data('/internal/orders', [/* the data */])   // never called by frontend
  .get('/api/orders', (_req, ctx) => ctx.endpoint('/internal/orders').data)
  .done();
```

Why: keeps the data layer reusable across multiple public routes without duplicating the array.

## The `Endpoints` type map

A single map from URL → response type drives the entire type surface:

```ts
type Endpoints = {
  '/internal/orders': Order[];
  '/api/orders/:id':  Order;
  '/ws/notifications': WsEndpoint<ServerEvent, ClientEvent>;
};

const orders = mockGroup<Endpoints>()./* ... */.done();
```

Mockr reads it to:
- Type each handler's response body and `.data()` seed.
- Type `req.params` (from `:name`), `server.endpoint(url)`, and `ctx.endpoint(url)`.
- Validate shape via `EndpointHandle<T>` (list vs record vs ws).

Declare it **once** and share it across every group — `mockr({ groups: [a, b] })` composes groups that use the same map, with no `EndpointDef<any>` cast. Cross-group stores (a `/internal/*` list mutated by one group and read by another) live in that one map, so `ctx.endpoint` is typed everywhere.

## Pick the cheapest declaration

| You want | Use |
|---|---|
| GET an array, full CRUD for free | `.data(url, T[])` |
| GET an object, mutable | `.data(url, T)` |
| JSON file you edit by hand, hot-reloaded | `{ url, dataFile: file<T>(...) }` |
| Custom status / headers / cross-endpoint joins | `.get/.post/...(url, fn)` |
| Streaming bidirectional events | `{ url, ws: ws({ ... }) }` |

Promote to a handler only when the defaults aren't enough.

## Side channels

- **`ctx.forward()`** — call upstream from inside a handler. Mutate or replay the response. Requires `proxy.target`.
- **Per-endpoint scenarios** — a verb spec's `scenarios: { empty, error }` switch via the `x-mockr-scenario` header or `?_scenario=`. Config-level `scenarios` patch endpoints by name via `POST /__mockr/scenario`.
- **`verify`** — run with `verify: true` (or `--verify`) to check served bodies against each endpoint's `responseSchema` and report drift.
- **`WsHandle.broadcast`** — push to every connected ws client from any HTTP handler.

## What mockr is **not**

- Not a production server. No auth, no observability hooks, no rate limiting that you'd trust under load.
- Not a record-replay proxy. The recorder writes files you commit; replay is the extension's job, not server-side.
- Not opinionated about your app stack. It's `node` + `tsx` + a `package.json` script.
