# Migration: legacy `handler()` / `endpoints()` → `mockGroup()`

Agent-oriented, mechanical rules for migrating a mock file from the deprecated
`handler()` + `endpoints()` API to the `mockGroup()` builder. `handler()`,
`endpoints()`, and `typedData()` still work (deprecated) — migrate file by file.

## Setup

A group becomes a builder typed against the same `Endpoints` map, ending in `.done()`:

```ts
// before
import { handler, endpoints } from '@yoyo-org/mockr'
export const mocks = endpoints<Endpoints>([ /* defs */ ])

// after
import { mockGroup } from '@yoyo-org/mockr'
const mock = mockGroup<Endpoints>()
// ...mock.get(...) / mock.post(...) / mock.data(...)
export const mocks = mock.done()
```

## Rules (apply in order)

1. **Single-verb handler def → `mock.<verb>(url, fn)`.**
   ```ts
   // before
   { url: '/x', method: 'GET', handler: handler<undefined, undefined, undefined, Endpoints>({ fn: () => ({ body: DATA }) }) }
   // after
   mock.get('/x', () => DATA)
   ```
   Drop all four `handler<...>` generics — the builder infers body/params/ctx from the URL.

2. **Drop the `{ body: X }` wrapper — return the body directly.**
   `() => ({ body: DATA })` → `() => DATA`. Keep the object form only when you set
   `status`/`headers`: `() => ({ status: 201, body: DATA })`. If your payload itself
   has a top-level `body` or `raw` key, keep it wrapped: `() => ({ body: payload })`.

3. **Schemas: keep them, drop the generics.**
   ```ts
   // before
   handler<typeof bodySchema, undefined, typeof paramsSchema, Endpoints>({ body: bodySchema, params: paramsSchema, fn })
   // after
   mock.post('/x', { body: bodySchema, fn })   // params inferred from :name in the URL
   ```
   Delete hand-written params schemas whose only job was `z.string()` per segment —
   `req.params` is typed from the URL's `:name` tokens.

4. **`methods: { GET, POST }` map → one call per verb on the same URL.**
   ```ts
   // before
   { url: '/x', methods: { GET: handler({ fn: a }), POST: handler({ body: s, fn: b }) } }
   // after
   mock.get('/x', a)
   mock.post('/x', { body: s, fn: b })
   ```
   `.done()` re-merges same-URL verbs into one endpoint. Duplicate verb+URL throws.

5. **`{ url, data: seed }` → `mock.data(url, seed)`.** Seed is typed against the URL.

6. **Multi-file composition: drop the `EndpointDef<any>[]` cast.**
   Use one shared `Endpoints` map for all groups; pass them via `groups`:
   ```ts
   // before
   const all: EndpointDef<any>[] = [...groupA, ...groupB]
   await mockr({ endpoints: all })
   // after
   await mockr({ groups: [groupA, groupB] })   // each groupX = mockGroup<Endpoints>()...done()
   ```
   Declare cross-group stores (e.g. an internal `/internal/*` source-of-truth list)
   once in the shared `Endpoints` map — `ctx.endpoint(url)` is typed across all groups.

7. **`ctx.endpoints(url)` (plural) → `ctx.endpoint(url)`** (already done in v0.3.0; verify).

8. **Error/empty responses → `ctx` shorthands.**
   `{ status: 404, body: { error: 'x' } }` → `ctx.error(404, 'x')`;
   `{ status: 201, body }` → `ctx.created(body)`; `{ status: 204 }` → `ctx.noContent()`.

9. **Repeated URL prefix → `.prefix()`.**
   ```ts
   mockGroup<Endpoints>().prefix('/api/v1/enterprise/project-groups/*')
     .get('/projects/', ...).get('/company-performance/', ...)
   ```
   The sub-path is constrained so `prefix + sub` is a key of `Endpoints`.

## Helpers to fold in while migrating

- **Multi-value / JSON query params** → `jsonArrayParam(inner?)` / `jsonParam(inner?)`
  in the `query` schema. `jsonArrayParam` parses repeated `?k=...&k=...` values, drops
  malformed ones, returns `T[]`. `inner` is any `ParseableSchema` (zod or hand-rolled).
  Replaces hand-rolled `z.union([z.string(), z.array(z.string())]).optional()` +
  `JSON.parse` + normalize loops.

- **Manual `await sleep(ms)`** → `delay: ms` on the verb spec.

- **Hand-rolled seeded data (`pseudoRandom`, hardcoded tables)** → faker (userland dep)
  for cosmetic values + `factory<T>(defaults | thunk)` for typed fixture shaping.
  Keep real IDs real (a proxy forwards un-mocked calls upstream; fabricated IDs 404).

## New capabilities (optional, add where useful)

- **`responseSchema` + `mockr({ verify })`** — attach a contract schema per verb;
  run with `--verify` to report when the served (or proxied real) body drifts from it.
- **`scenarios: { empty, error, ... }`** — alternate responses switched per request via
  the `x-mockr-scenario` header or `?_scenario=<name>`.

## Verify the migration

```bash
npx tsc --noEmit   # types: no manual generics, bodies checked against the map
# boot the server; mockr lint warns on shadowed routes at startup
```
