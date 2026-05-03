# mockr context

## Glossary

- **User (primary)**: Junior frontend dev mocking an unfinished backend while building a feature. Optimizes for 5-min onboard, no zod required, copy-paste from network tab works. Senior FE and QA are secondary — if API is clear for junior, it works for them too.

## Decisions

- **API ergonomics overhaul targets v0.3.0.** Breaking changes allowed; no deprecation window, no parallel APIs. Pre-1.0, no external users.
- **All endpoints mutable.** No read-only static endpoints.
- **Single field name `data` for both kinds.** Shape decides behavior:
  - **list** — `data: T[]`. Handle: `findById`, `where`, `first`, `count`, `has`, `insert`, `nextId`, `update`, `updateMany`, `patch`, `remove`, `clear`, `reset`.
  - **record** — `data: T` (non-array object). Handle: `set(patch)`, `replace(obj)`, `reset`.
- **Handle type conditional**: `T extends any[] ? ListHandle<T> : RecordHandle<T>`.
- **`Endpoints` type drives kind by shape**: `'/url': Foo[]` → list, `'/url': Foo` → record.
- **`response` form removed.** Custom status/headers go through `handler`.
- **Endpoint def has 3 forms**: `data` (list or record by shape), `dataFile` (load from disk, shape auto-detected), `handler` (custom). Mutually exclusive. **`body` is reserved for request-side only** (`req.body`, validation schema `handler({ body })`).
- **Hot-reload `dataFile`**: filesystem changes reload endpoint state. **Reset semantics** — in-memory mutations dropped, file content becomes new state. Debounce 100ms. Keep last good copy on bad JSON. Always on (no opt-in flag).
- **Manual `Endpoints` type + explicit generic at top level**: `type Endpoints = { '/url': T[] | T }; mockr<Endpoints>({...})`. No inference into top-level config.
- **`endpoints<T>()` helper exists for grouping** — `export const fooMocks = endpoints<FooEndpoints>([...])`. Same generic shape as `mockr<T>`. Runtime no-op. Type-level: each item's URL must exist in `T`, `data` must match `T[url]`, `ctx.endpoint(url)` inside group's handlers is typed against `T`. Compose at top level via intersection: `type Endpoints = FooEndpoints & BarEndpoints; mockr<Endpoints>({ endpoints: [...fooMocks, ...barMocks] })`.
- **`file<T>('./path')` factory for typed `dataFile`**: runtime = branded path string, type-level carries `T` so handle is typed without compile-time JSON import (hot-reload preserved).
- **`handler` is always the factory call** — `handler: handler({ body?, query?, params?, fn })`. No raw function shorthand. Single shape every time. Schemas in `body`/`query`/`params` flow generic into `fn`'s `req` so `req.body`/`req.query`/`req.params` are typed without manual generics or casts. Trade-off: one wrapper + one import even for trivial cases. Accepted for TS consistency.
- **Multi-method on same URL = single entry with `methods` map**:
  ```ts
  { url: '/api/cart', methods: { GET: handler({...}), POST: handler({...}) } }
  ```
  No separate array entries per method. `data`/`dataFile` provides default CRUD; `methods` overrides specific verbs.
- **Cross-endpoint access uses singular `ctx.endpoint(url)`** — matches `server.endpoint(url)`. No plural `ctx.endpoints`.
- **Scenarios are declarative** — function returns `{ [url]: EndpointDef patch }`. No imperative `.insert()` / `.clear()` calls inside scenarios; no direct `handle.handler = ...` assignment. Receives `{ baseline(url) }` helper to read original data when extending. Patch shape mirrors `EndpointDef` (`data`, `dataFile`, `handler`, `methods`).
- **`idKey` defaults to `'id'`**, override per endpoint. **Startup warning** if endpoint has `data` array but `idKey` field missing on items — surfaces silent fallback to array index.
- **Boot-time config validation throws** with aggregated error listing every bad def by index + URL. Catches: unknown keys (with did-you-mean), conflicting forms (`data` + `handler`), `dataFile` path missing, duplicate URL+method, malformed `methods` map. Junior sees one clear error instead of silent misregistration.
- **`ctx.forward()` — forward request to upstream and mutate response inside a handler.** Sits between `handler()` (pure synthetic) and `proxy` (pure passthrough). Available on `HandlerContext` only when `proxy.target` configured; throws synchronously otherwise. Optional patch `{ path?, method?, headers?, body? }` — omitted fields inherit from current `req`. Returns `HandlerResult` with body parsed (JSON) or string (`raw: true` for non-JSON), headers mutable, `set-cookie` already stripped of `Domain=` and `Secure` (same as proxy mode). Network failures throw — user wraps in try/catch for graceful degradation. Body typed via `Endpoints[url]` inference; `ctx.forward<T>()` overrides per call. Console tag = `fwd` (third state alongside `mock`/proxy `->`/`404`). Participates in mem-session: GET/HEAD upstream responses cached in record mode, served from cache in replay mode (mutation always runs fresh on cached body). Cache key matches existing scheme (`${method} ${path}${normalizedQuery}`). Implementation reuses `handleProxy` internals.

## Extension (chrome-extension/)

### Glossary

- **Mem-session** — server-side in-memory cache of GET/HEAD responses, process-local. Two modes: `record` (capture matching responses into the active session), `replay` (return cached response if key matches). Non-cacheable methods (POST/PUT/PATCH/DELETE) never enter a session even when active. Cache key: `${method} ${path}${normalizedQuery}`.
- **Endpoint group** — server-declared logical grouping of endpoints, declared via optional name arg on `endpoints<T>(name?, items)`. Server exposes group on `/__mockr/endpoints`; Mocked tab renders one section per group. Ungrouped endpoints render flat. There is no FE-only folder layer.

### Decisions

- **Sessions auto-reload inspected page on every state change.** Activate-record, activate-replay, deactivate, and switch all call `chrome.devtools.inspectedWindow.reload()`. Symmetric — junior expects "set mode → see effect" without manual F5. Server session state survives reload (process-local closure). No confirm dialog; if form-state loss becomes an issue, add an opt-out toggle later.
- **Map flow surfaces every failure.** Errors return a toast, not `console.error`. Empty bodies refuse to map (server returns 400). JSON content-type validates before write; invalid JSON returns 400 with the parse error. No silent empty-file writes.
- **Path-template detection deferred.** Mapping `/users/123` and `/users/456` produces two separate endpoints. No `:id` extraction in v0.3.0.
- **Folders concept deleted.** FE-only `chrome.storage.local.mockrFolders2` removed. Grouping derives from server config via `endpoints<T>(name?, items)`. No drag-drop, no FE assignment state. To regroup an endpoint, edit the server config file (which Mocked tab can open in the editor).
- **`endpoints<T>(name?, items)` accepts optional group name.** `endpoints<AuthEndpoints>('Auth', [...])` tags every item with `__group: 'Auth'`. Omitted name = ungrouped (current behavior). Runtime stays a near-no-op (returns the array, optionally with group tag attached). Type-level constraints unchanged.
