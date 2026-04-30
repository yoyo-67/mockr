# 006 — `methods` map for multi-verb URLs

**Type:** AFK
**Spec:** [`docs/superpowers/specs/2026-04-30-mock-writing-api-redesign-design.md`](../../specs/2026-04-30-mock-writing-api-redesign-design.md)
**Plan tasks:** 12

## What to build

Single endpoint entry can declare multiple HTTP verbs in a `methods` map. Replaces the today-pattern of repeating the URL across multiple array entries (one per verb).

`methods` may stand alone (no data store, all verbs explicit) OR sit alongside `data` / `dataFile` (overrides specific verbs while default CRUD covers the rest). When an HTTP request hits a verb not in the map and there's no fallback CRUD, server responds 405 with an `Allow` header.

## Acceptance criteria

- [ ] `src/types.ts` adds `MethodMap<TEndpoints>` = `Partial<Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD', HandlerSpec<...>>>`.
- [ ] `EndpointDef` union includes a `methods` overlay on `data` / `dataFile` forms AND a stand-alone `methods` form (no `data` / `dataFile` / `handler`).
- [ ] Conflict matrix at validator level (slice 8 wires it): `handler` + `methods` rejected, `method` + `methods` rejected.
- [ ] Server dispatch: when request method matches a key in `methods`, invoke that handler. Otherwise fall through to `data`/`dataFile` default CRUD if present. Otherwise respond 405 with `Allow` header listing the keys present in `methods`.
- [ ] `src/http-utils.ts` adds `send405(res, allowed)` helper.
- [ ] Runtime tests (TDD red → green) in `tests/methods-map.test.ts`: GET+POST from same entry; verb-not-in-map returns 405 with Allow header; methods overrides default CRUD POST while default GET still serves data.
- [ ] Type tests via `expectTypeOf` in `tests/methods-map.test-d.ts`: `// @ts-expect-error` for lowercase verb keys; `// @ts-expect-error` for non-`HandlerSpec` value; `// @ts-expect-error` for `handler` + `methods` together on the same def; `// @ts-expect-error` for top-level `method` + `methods` together.
- [ ] One example (`examples/ecommerce/server.ts`) migrated to use `methods` map for `/api/cart`.
- [ ] README "Multi-verb endpoints" section.

## Blocked by

- 001 (new `EndpointDef` union)
- 002 (`HandlerSpec`)

## Notes

- Method-map keys are uppercase verbs — validator rejects lowercase (slice 8).
- `method` (singular, top-level shorthand) and `methods` (plural map) are mutually exclusive; documented + validated.
