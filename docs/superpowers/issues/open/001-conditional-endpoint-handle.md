# 001 — Conditional EndpointHandle (list/record from single `data`)

**Type:** AFK
**Spec:** [`docs/superpowers/specs/2026-04-30-mock-writing-api-redesign-design.md`](../../specs/2026-04-30-mock-writing-api-redesign-design.md)
**Plan tasks:** 4, 5, 6, 7

## What to build

Single `data` field on `EndpointDef` works for both list (`T[]`) and record (`T`) endpoints. Shape decides handle behavior. `EndpointHandle<T>` becomes a TS conditional that picks `ListHandle<T>` or `RecordHandle<T>` at the type level. Runtime factory dispatches on `Array.isArray`.

Drops the old `body`/`response` forms from `EndpointDef`. New union: `data` | `dataFile` | `handler` | (later) `methods`.

## Acceptance criteria

- [ ] `src/list-handle.ts` exists, exports `ListHandle<T>` interface + `createListHandle(initial, opts?)`. Carries the existing CRUD methods (`findById`, `where`, `first`, `count`, `has`, `insert`, `nextId`, `update`, `updateMany`, `patch`, `remove`, `clear`, `reset`, `save`).
- [ ] `src/record-handle.ts` exists, exports `RecordHandle<T extends object>` interface + `createRecordHandle(initial)`. Methods: `data` (getter), `set(patch)`, `replace(value)`, `reset()`. Reset uses a deep copy so post-reset mutations don't leak into baseline.
- [ ] `src/endpoint-handle.ts` becomes a thin dispatcher: `EndpointHandle<T> = T extends readonly any[] ? ListHandle<...> : T extends object ? RecordHandle<T> : never`. `createEndpointHandle(initial, opts?)` returns the right kind based on `Array.isArray(initial)`.
- [ ] `src/types.ts` `EndpointDef` union collapses to: `data` | `dataFile` | `handler` (`methods` overlay added in slice 6). `body` and `response` forms removed. `body` reserved for request side only.
- [ ] Server endpoint registration recognizes `data: object` (record) — today only `data: array` was supported. Record endpoints respond GET → object; PATCH/PUT mutate via handle.
- [ ] Tests: `tests/list-handle.test.ts` (CRUD parity), `tests/record-handle.test.ts` (set/replace/reset + deep-copy reset), `tests/endpoint-handle-dispatch.test.ts` (factory picks right kind).
- [ ] All existing tests still pass after the migration. Tests using old `body:` / `response:` shorthand are updated to use the new shape.
- [ ] One example (`examples/todo/server.ts`) demonstrates `data: T[]`. One example (or playground) demonstrates `data: T` (record).
- [ ] README "How it works" section reflects the new shape.

## Blocked by

None — start immediately.

## Notes

- Task 7 in the plan commits an intentionally-broken intermediate state. That's fine for slice-internal commits but the slice as a whole must end green.
- `endpoint-handle.ts` ends up much smaller than today's 143-line file; that's expected.
