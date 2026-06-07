# Partitioned `.data` stores + run-once loaders (replacing `hydrate`)

## Context

The recurring mocking need: a list comes from a real/derived source, then the user creates entries locally and expects later `GET`s to show them — "POST adds to GET." `hydrate(loader)` served this: fetch once, own, CRUD sticks.

Two problems surfaced using it on a real feature (`/projects/:projectId/companies/`):

1. **Ergonomics.** The `.data(url, hydrate(loader))` wrapper read as ceremony; the only alternative was hand-rolling a cache inside a `GET` handler (a code smell — double returns, `.value` plumbing).
2. **Cross-resource bleed (correctness).** A `data` store is keyed by **URL pattern**, so the first `:projectId` to hit `/projects/:projectId/companies/` seeded the single store and **every other project saw that project's companies**.

A separate question — should the base be **live** (re-fetch upstream every request) — was settled first: the driving cases are **static-per-session** (the list is generated once or comes from a backend that doesn't move mid-session), so "live" buys nothing but flicker. Own-once is the right behavior; the dislike of `hydrate` was about (1) and (2), not its core behavior.

## Decision

**Replace `hydrate()` with an overload of `.data`, and partition param'd stores by resolved path params.**

```ts
.data('/projects/:projectId/companies/', (req, ctx) =>            // loader: run once per project
  buildCompaniesFromActivities(req, ctx))
// elsewhere, same projectId:
ctx.endpoint('/projects/:projectId/companies/').insert(newCompany) // hits THIS request's project
```

1. **Shape decides (extending the existing list/record rule).** `.data(url, value)` = static seed; `.data(url, fn)` = a loader `(req, ctx) => T | Promise<T>` run **once per partition** on first access, then owned (CRUD sticks). `hydrate()` and `ctx.hydrate` / `ctx.endpoint(url).hydrate` are removed — one surface, no wrapper.

2. **A URL with path params ⇒ one store per resolved param-set** — for **both** static and loader `.data` (one rule, no exceptions). `projectId=A` and `B` are independent, each with its own seed (a fresh clone of the static value, or the loader run with that request).

3. **Partition resolution is keyed off the current request.** Inside a handler, `ctx.endpoint(url)` resolves the partition by matching the target URL's param names against the **current request's** resolved params — so a cross-endpoint write at a *different* URL that also carries `:projectId` hits the same project's partition. Missing/mismatched param ⇒ **throw** a clear error.

4. **First access of any kind seeds the partition** — a write (create) before any read runs the loader, *then* applies the write (no empty-latch, no lost base). Handle **kind is inferred from the seeded value** (`Array.isArray` → list, else record). Concurrent first accesses share one in-flight load (loader runs once).

5. **`reset()` resets all partitions.** Out-of-request targeted access (no request to key off) **throws**; `server.endpoint(url, params)` to target one partition is deferred. No eviction — partitions live for the server's lifetime (mock dev servers are short-lived; project counts are tiny).

**Live is a separate, non-overlapping choice:** an endpoint whose base must reflect upstream changes mid-session uses a plain `handler`/`.get` calling `ctx.forward()` every request. Own-once and live don't mix in one declaration.

## Considered options

- **Keep `hydrate()`, just fix bleed** — rejected: leaves the wrapper ceremony (complaint 1).
- **Manual string-keyed scope** (`ctx.store(\`companies:${projectId}\`)` / explicit `scopeBy`) — rejected: reintroduces the hand-rolled-cache smell and a footgun a junior must remember.
- **Live + overlay** (re-forward every request, replay local changes on top) — rejected once the base was confirmed static-per-session: pays flicker + replay/clone/merge complexity for liveness nothing needs.
- **Partition only loader-backed stores, leave static param'd stores shared** — rejected: incoherent (same URL shape, different bleed behavior); a footgun.
- **Out-of-request access returns an aggregate `Map<param, data>`** — rejected for now: invents a surprising shape; throwing is clearer. Revisit if tests/TUI need it.

## Consequences

- **Breaking** (pre-1.0, allowed): static param'd `.data` stores that relied on cross-param sharing now isolate per param-set. No known cases; add an opt-out only if one appears.
- `.data(url, value)` vs `.data(url, fn)` look similar but differ (static vs run-once) — the one bit of implicit behavior, accepted for consistency with the existing "shape decides" rule.
- Memory grows with distinct param-sets per session; acceptable given the usage profile.
