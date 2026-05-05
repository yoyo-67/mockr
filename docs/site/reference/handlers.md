# Handlers reference

`handler({ body?, query?, params?, fn })` builds the spec attached to `endpoint.handler` (or `endpoint.methods.GET` etc.). Optional zod schemas validate the request before `fn` runs; their inferred output flows into `req`.

## Signature

```ts
import { handler } from '@yoyo-org/mockr';

handler({
  body?:   ParseableSchema<TBody>,
  query?:  ParseableSchema<TQuery>,
  params?: ParseableSchema<TParams>,
  fn: (req, ctx) => HandlerResult | Promise<HandlerResult>,
});
```

`ParseableSchema<T>` is anything with a `safeParse(input) => { success; data; error }` method — zod 3 / zod 4 both qualify, and you can hand-roll one.

Validation failure short-circuits with `400 Bad Request` and an error body. `fn` does not run.

## `req` (`MockrRequest`)

| Field | Description |
|---|---|
| `method` | HTTP verb. |
| `url` | Path + query string. |
| `query` | Parsed `?key=value`. Typed by the `query` schema. |
| `params` | Path params from `:name` segments. Typed by the `params` schema. |
| `body` | Parsed JSON / form / text. Typed by the `body` schema. |
| `headers` | Lowercase request header map. |
| `raw` | Native `IncomingMessage` for escape hatches. |

## `ctx` (`HandlerContext`)

| Member | Description |
|---|---|
| `endpoint(url)` | Typed `EndpointHandle` for any other URL — see [Endpoints reference](/reference/endpoints). |
| `forward(opts?)` | Forward the request upstream (proxy target). Returns `{ status, headers, body }` so you can mutate before returning. |
| `server` | Reference to the running `MockrServer`. |
| `scenario` | Currently active scenario name, or `null`. |

`ctx.forward()` only resolves if `proxy.target` is configured. See [Proxy & forward](/reference/proxy).

## `HandlerResult`

Anything `fn` returns gets normalized:

| Field | Default | Description |
|---|---|---|
| `status` | `200` | HTTP status. |
| `body` | `{}` | Response body. Auto-JSON-encoded for objects/arrays. |
| `headers` | `{}` | Extra response headers. |

Returning a plain object is fine — it's wrapped as `{ status: 200, body }`.

## Multi-verb endpoints

Drop the top-level `method`, attach `methods: { GET, POST, ... }`:

```ts
{
  url: '/api/cart',
  methods: {
    GET:  handler({ fn: (_req, ctx) => ({ body: ctx.endpoint('/internal/cart').data }) }),
    POST: handler({
      body: z.object({ product_id: z.number(), quantity: z.number() }),
      fn: (req, ctx) => {
        ctx.endpoint('/internal/cart').insert(req.body);
        return { status: 201, body: { ok: true } };
      },
    }),
  },
}
```

`methods` may sit alongside `data` / `dataFile` — listed verbs override, others get default CRUD. Verbs not in the map respond `405 Method Not Allowed` with an `Allow` header.

## Custom status / headers

```ts
handler({ fn: () => ({
  status: 503,
  headers: { 'Retry-After': '30' },
  body: { error: 'service down' },
}) });
```

## Async work

`fn` may be async — `await` upstream calls, file I/O, `ctx.forward()`, etc. The router awaits before responding.
