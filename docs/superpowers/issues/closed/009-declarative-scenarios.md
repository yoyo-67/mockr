# 009 — Declarative scenarios + `baseline()` helper

**Type:** AFK
**Spec:** [`docs/superpowers/specs/2026-04-30-mock-writing-api-redesign-design.md`](../../specs/2026-04-30-mock-writing-api-redesign-design.md)
**Plan tasks:** 15

## What to build

Scenarios become declarative: a function that returns `{ [url]: EndpointDefPatch }`. No imperative `.insert()` / `.clear()` calls. No direct `handle.handler = fn` assignment.

The function receives a `{ baseline(url) }` helper that returns a deep copy of the original data declared at startup, so a scenario can extend rather than replace.

## Acceptance criteria

- [ ] `src/types.ts` adds `ScenarioContext<TEndpoints>`, `EndpointDefPatch<TEndpoints>` (subset of `EndpointDef`: `data`, `dataFile`, `handler`, `methods`), `ScenarioFn<TEndpoints>`.
- [ ] `MockrConfig.scenarios` is `Record<string, ScenarioFn<TEndpoints>>`.
- [ ] `src/scenarios.ts` exports `createScenariosState(initialData)` and `applyScenario(state, fn, applyPatch)`.
- [ ] On boot, server snapshots initial data per endpoint into `baselines` (deep-cloned). `baseline(url)` returns a fresh deep copy each call.
- [ ] `server.scenario(name)` calls the scenario fn and applies the returned patches:
  - `patch.data` defined → replace handle's data (via `replaceData` for list, `replace` for record).
  - `patch.handler` defined → swap registered handler for that URL.
  - `patch.methods` defined → merge into the URL's methods map.
  - `patch.dataFile` defined (rare) → reload from new path.
- [ ] `server.reset()` reloads baselines into all handles + clears scenario state.
- [ ] Old shape (`(s) => { s.endpoint(url).insert(...) }`) is removed; no backwards compatibility shim.
- [ ] Runtime tests (TDD red → green) in `tests/scenarios.test.ts`: replace data with empty array; extend via `baseline()` (and confirm subsequent calls don't see prior mutation — deep copy); swap handler returns 503; reset restores baselines; `methods` patch swaps individual verbs.
- [ ] Type tests via `expectTypeOf` in `tests/scenarios.test-d.ts`: `ScenarioFn<E>` returns `Partial<Record<keyof E, EndpointDefPatch>>`; `baseline('/url')` is typed as `E[url]`; `// @ts-expect-error` for unknown URL in patch keys; `// @ts-expect-error` for `data` shape mismatch against the URL's declared type.
- [ ] One example (`examples/auth-api/server.ts`) migrated to declarative scenarios.
- [ ] README "Scenarios" section rewritten.

## Blocked by

- 001 (data field + handle types)
- 002 (`HandlerSpec`)
- 006 (`MethodMap` for patch shape)

## Notes

- `baseline(url)` returns a deep copy each call; otherwise a scenario could accidentally mutate the snapshot and pollute the next scenario.
- The patch shape is intentionally a subset of `EndpointDef` so future fields automatically apply.
