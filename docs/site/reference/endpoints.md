# Endpoints reference

`EndpointHandle<T>` is a conditional type:

- `T extends U[]` → `ListHandle<U>`
- `T extends object` → `RecordHandle<T>`

`server.endpoint(url)` and `ctx.endpoint(url)` (inside a handler) both return one. The `Endpoints` map carries the per-URL type, so the handle is typed without a cast.

Stores are authored with [`.data(url, seed)`](/reference/builder) on the builder, or as a plain def for file-backed data:

```ts
mockGroup<Endpoints>()
  .data('/internal/todos', [{ id: 1, title: 'Buy milk', done: false }])  // → ListHandle<Todo>
  .done();

// file-backed store (plain def — the builder has no .dataFile)
{ url: '/api/todos', dataFile: file<Todo[]>('./todos.json') }            // → ListHandle<Todo>
```

A handler reaches any other store through `ctx.endpoint(url)`:

```ts
.get('/api/todos', (_req, ctx) => ctx.endpoint('/internal/todos').data)
```

## `ListHandle<U>` — list endpoints (`data: U[]`)

Backs every endpoint defined with an array `data` or an array `dataFile`. Mutations persist in memory across requests; `replaceData` is what the file watcher calls when the JSON changes on disk.

| Member | Type | Description |
|---|---|---|
| `data` | `U[]` | Live, mutable backing array. Reads reflect inserts / updates / removes. |
| `findById(id)` | `U \| undefined` | Loose-equality lookup on the id field. |
| `where(filter)` | `U[]` | `Partial<U>` match — every key must equal. |
| `where(predicate)` | `U[]` | Predicate variant. |
| `first()` | `U \| undefined` | First item. |
| `count()` | `number` | Number of items. |
| `has(id)` | `boolean` | Existence check. |
| `nextId()` | `number` | `max(id) + 1`, `1` for empty list. |
| `insert(item)` | `U` | Append; auto-generates `id` if missing. |
| `update(id, patch)` | `U \| undefined` | Partial update (`Object.assign`). |
| `updateMany(ids, patch)` | `U[]` | Batch update; missing ids skipped. `patch` may be a function `(item) => Partial<U>`. |
| `patch(id, fields, defaults?)` | `U \| undefined` | Apply non-`undefined` fields, then unconditional defaults. |
| `remove(id)` | `boolean` | Delete; `true` if removed. |
| `clear()` | `void` | Empty the list. |
| `reset()` | `void` | Restore the original (deep copied) baseline. |
| `replaceData(items)` | `void` | Replace data **and** baseline. Used by `dataFile` hot-reload. |
| `save(path)` | `Promise<void>` | Persist current data as JSON. |

The id field is `'id'` by default. Override per handle via `ListHandleOptions.idKey`.

## `RecordHandle<T>` — record endpoints (`data: T`)

Single-object endpoint. GET returns the object; PATCH shallow-merges; PUT replaces.

| Member | Description |
|---|---|
| `data` | Read-only getter — current object. |
| `set(patch)` | Shallow-merge `patch` into the object. |
| `replace(value)` | Overwrite. |
| `reset()` | Restore the original baseline (deep copy). |

## `WsHandle<Out>` — WebSocket endpoints

`ctx.endpoint('/ws/...')` returns this when the URL was defined with `ws({...})`. See [WebSocket reference](/reference/websocket).

## `MockrServer`

Returned by `await mockr<E>({...})`. Stays alive until `.close()`.

| Member | Description |
|---|---|
| `endpoint(url)` | Typed `EndpointHandle` for a URL. |
| `listEndpoints()` | All endpoints with `{ url, method, type, enabled }`. |
| `enableEndpoint(url)` / `disableEndpoint(url)` | Toggle one. |
| `enableAll()` / `disableAll()` | Bulk toggle. |
| `use(middleware)` | Add middleware at runtime. |
| `scenario(name)` | Apply a named scenario. |
| `reset()` | Reset every endpoint to its initial baseline. |
| `save(path)` | Save full snapshot to file. |
| `setPort(port)` | Move to a new port. |
| `enableProxy()` / `disableProxy()` | Toggle proxy. |
| `setProxyTarget(url)` | Change proxy target. |
| `tui()` | Launch the terminal UI. |
| `recorder` | Recorder API (if enabled in config). |
| `close()` | Shut down. |

## `EndpointDef`

The shape each entry of `endpoints: [...]` accepts. The [builder](/reference/builder) emits these for you; write them directly when you need `dataFile` or `ws`, which the builder doesn't cover. Mutually exclusive top-level shorthands plus optional cross-cutting config:

```ts
interface EndpointDef<E, U extends keyof E = keyof E> {
  url: U | string | RegExp;
  // exactly one of:
  data?: E[U];                   // → list (array) or record (object)
  dataFile?: string | FileRef<E[U]>; // hot-reloaded JSON
  ws?: WsSpec;                   // WebSocket endpoint
  methods?: Record<HttpMethod, VerbSpec>;     // multi-verb (builder output)
  // optional:
  method?: HttpMethod;
  enabled?: boolean;
  idKey?: string;                // override `'id'` for list endpoints
}
```

Most defs come from `mockGroup().done()`. Reach for a hand-written def only for file-backed stores (`dataFile: file<T>('./x.json')`, hot-reloaded on change) or WebSockets (`ws({...})`); both go straight into `endpoints: [...]` alongside any `groups`.
