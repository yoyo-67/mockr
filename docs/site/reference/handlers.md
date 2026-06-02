# Handlers reference

A handler is the function (or [verb spec](#verb-spec)) you pass to `.get/.post/.put/.patch/.delete(url, def)` on the [builder](/reference/builder). It receives `req` and `ctx` and returns the response body.

## Signature

```ts
mockGroup<Endpoints>()
  .get('/api/todos', (req, ctx) => ctx.endpoint('/internal/todos').data)
  .done();
```

The bare function form is `(req, ctx) => body`. For request validation, delay, a response contract, or scenarios, pass a [verb spec](#verb-spec) object instead — the function moves to its `fn` field.

## Return value

Return the **body directly** — it's type-checked against the URL's type:

```ts
.get('/api/todos', () => [{ id: 1, title: 'a', done: false }])
```

Return an object with `status` / `headers` / `raw` for control, or use the `ctx` shorthands:

```ts
.get('/api/todos/:id', (req, ctx) =>
  req.params.id === '0' ? ctx.error(404, 'not found') : { id: 1, title: 'a', done: false })
```

| Field | Default | Description |
|---|---|---|
| `status` | `200` | HTTP status. |
| `body` | `{}` | Response body. Auto-JSON-encoded for objects/arrays. |
| `headers` | `{}` | Extra response headers. |
| `raw` | — | Raw string/buffer body, bypassing JSON encoding. |

> If a response body itself has a top-level `body` or `raw` key, wrap it: `() => ({ body: payload })`.

`fn` may be async — `await` upstream calls, file I/O, `ctx.forward()`, etc. The router awaits before responding.

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

Validation failure short-circuits with `400 Bad Request` and an error body — `fn` does not run. A schema is anything with a `safeParse(input) => { success; data; error }` method, so zod 3 / zod 4 both qualify and you can hand-roll one.

## `req` (`MockrRequest`)

| Field | Description |
|---|---|
| `method` | HTTP verb. |
| `url` | Path + query string. |
| `query` | Parsed `?key=value`. Typed by the `query` schema. |
| `params` | Path params from `:name` segments. Typed by the `params` schema, else inferred from the URL. |
| `body` | Parsed JSON / form / text. Typed by the `body` schema. |
| `headers` | Lowercase request header map. |
| `raw` | Native `IncomingMessage` for escape hatches. |

When no `params` schema is given, `req.params` is typed from the URL's `:name` segments. For JSON-encoded query params, use [`jsonParam` / `jsonArrayParam`](/reference/query-params) inside the `query` schema.

## `ctx` (`HandlerContext`)

| Member | Description |
|---|---|
| `endpoint(url)` | Typed `EndpointHandle` for any URL in the map — see [Endpoints reference](/reference/endpoints). |
| `forward(patch?)` | Forward the request upstream (proxy target). Returns `{ status, headers, body }` so you can mutate before returning. |
| `error(status, message?)` | `{ status, body: message ? { error: message } : undefined }`. |
| `created(body)` | `{ status: 201, body }`. |
| `noContent()` | `{ status: 204 }`. |
| `server` | Reference to the running `MockrServer`. |
| `scenario` | Currently active scenario name, or `null`. |

`ctx.forward()` only resolves if `proxy.target` is configured. See [Proxy & forward](/reference/proxy).

## Multi-verb endpoints

Register more than one verb on the same URL — they merge into one endpoint at `.done()`:

```ts
mockGroup<Endpoints>()
  .get('/api/cart', (_req, ctx) => ctx.endpoint('/internal/cart').data)
  .post('/api/cart', {
    body: z.object({ product_id: z.number(), quantity: z.number() }),
    fn: (req, ctx) => {
      ctx.endpoint('/internal/cart').insert(req.body);
      return ctx.created({ ok: true });
    },
  })
  .done();
```

Verb handlers may sit alongside a `.data(url, seed)` store on the same URL — listed verbs override, the rest keep their default CRUD. Verbs with no handler respond `405 Method Not Allowed` with an `Allow` header.

## Custom status / headers

```ts
.get('/api/health', () => ({
  status: 503,
  headers: { 'Retry-After': '30' },
  body: { error: 'service down' },
}))
```
