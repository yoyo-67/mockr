# Concepts

The mental model is small. Read this once, then jump to [tutorial](/tutorial/) or [reference](/reference/).

## Endpoints are named data holders

Every endpoint has a URL and a payload. The shape of the payload picks the behavior — no glue code:

| Payload | Endpoint type | Verbs handled |
|---|---|---|
| `data: T[]` | List | GET / POST / PUT / PATCH / DELETE |
| `data: T` (object) | Record | GET / PATCH / PUT |
| `dataFile: './x.json'` | Inferred from JSON shape | Same as above + hot-reload |
| `handler: handler({...})` | Hand-rolled | Single verb (default GET) |
| `methods: { GET, POST, ... }` | Hand-rolled per verb | Each declared verb |
| `ws: ws({...})` | WebSocket | n/a — upgrade |

Mutations on list / record endpoints persist in memory across requests. `server.reset()` restores baselines.

## `/internal/*` vs `/api/*`

A convention, not a rule. `/internal/*` endpoints hold source-of-truth data. `/api/*` endpoints are thin handlers that join, filter, or mutate them. The frontend only calls `/api/*`.

```ts
endpoints: [
  { url: '/internal/orders', data: [/* the data */] },     // never called by frontend
  {                                                         // public api
    url: '/api/orders',
    handler: handler({ fn: (req, ctx) => ({
      body: ctx.endpoint('/internal/orders').data,
    }) }),
  },
]
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

mockr<Endpoints>({ /* ... */ });
```

Mockr reads it to:
- Type the `data` field per endpoint.
- Type `server.endpoint(url)` and `ctx.endpoint(url)`.
- Validate shape via `EndpointHandle<T>` (list vs record vs ws).

You don't have to declare it — without `<E>` everything is `unknown`. Adding it pays off the moment two endpoints share data.

## Two ways to mock a route

| You want | Use |
|---|---|
| GET an array, full CRUD for free | `data: T[]` |
| GET an object, mutable | `data: T` |
| JSON file you edit by hand, hot-reloaded | `dataFile` |
| Custom status / headers / cross-endpoint joins | `handler({ fn })` |
| Streaming bidirectional events | `ws({ ... })` |

Pick the cheapest one that does the job. Promote to `handler` only when defaults aren't enough.

## Side channels

- **HTTP control** — `POST /__mockr/scenario` switches scenarios; `/__mockr/recorder/*` drives the Chrome extension. Off in production builds (the binary won't ship anyway — mockr is dev-time).
- **`ctx.forward()`** — call upstream from inside a handler. Mutate or replay the response. Requires `proxy.target`.
- **`WsHandle.broadcast`** — push to every connected ws client from any HTTP handler.

## What mockr is **not**

- Not a production server. No auth, no observability hooks, no rate limiting that you'd trust under load.
- Not a record-replay proxy. The recorder writes files you commit; replay is the extension's job, not server-side.
- Not opinionated about your app stack. It's `node` + `tsx` + a `package.json` script.
