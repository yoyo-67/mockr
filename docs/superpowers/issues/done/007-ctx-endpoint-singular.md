# 007 — `ctx.endpoint` singular rename

**Type:** AFK
**Spec:** [`docs/superpowers/specs/2026-04-30-mock-writing-api-redesign-design.md`](../../specs/2026-04-30-mock-writing-api-redesign-design.md)
**Plan tasks:** 13

## What to build

Inside handlers, cross-endpoint access is `ctx.endpoint(url)` (singular) — symmetric with `server.endpoint(url)`. Today's plural `ctx.endpoints(url)` returns a single handle but reads as "list of endpoints"; misleading. Rename for consistency.

## Acceptance criteria

- [ ] `src/types.ts` `HandlerContext<TEndpoints>` exposes `endpoint(url)` (singular). The plural `endpoints` field is removed.
- [ ] Server's handler context construction passes a singular `endpoint` function.
- [ ] Runtime tests (TDD red → green) in `tests/ctx-endpoint-singular.test.ts`: `ctx.endpoint(url).data` from inside a handler returns the right data; cross-endpoint mutation via `ctx.endpoint(url).insert(...)` persists.
- [ ] Type tests via `expectTypeOf` in `tests/ctx-endpoint.test-d.ts`: `ctx.endpoint('/users')` against `Endpoints = { '/users': User[] }` is `ListHandle<User>`; against record kind is `RecordHandle<T>`; `// @ts-expect-error` for `ctx.endpoints` (plural no longer exists); `// @ts-expect-error` for unknown URL.
- [ ] All examples that used `ctx.endpoints(...)` migrated to `ctx.endpoint(...)`.
- [ ] All level-* tests that used `ctx.endpoints(...)` migrated.
- [ ] README's cross-endpoint example uses `ctx.endpoint`.

## Blocked by

- 001 (final `EndpointHandle` shape)

## Notes

- Pure rename + delete; no behavior change.
