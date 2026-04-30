# 007 — `ctx.endpoint` singular rename

**Type:** AFK
**Spec:** [`docs/superpowers/specs/2026-04-30-mock-writing-api-redesign-design.md`](../../specs/2026-04-30-mock-writing-api-redesign-design.md)
**Plan tasks:** 13

## What to build

Inside handlers, cross-endpoint access is `ctx.endpoint(url)` (singular) — symmetric with `server.endpoint(url)`. Today's plural `ctx.endpoints(url)` returns a single handle but reads as "list of endpoints"; misleading. Rename for consistency.

## Acceptance criteria

- [ ] `src/types.ts` `HandlerContext<TEndpoints>` exposes `endpoint(url)` (singular). The plural `endpoints` field is removed.
- [ ] Server's handler context construction passes a singular `endpoint` function.
- [ ] Tests: `tests/ctx-endpoint-singular.test.ts` exercises `ctx.endpoint(url).data` from inside a handler.
- [ ] All examples that used `ctx.endpoints(...)` migrated to `ctx.endpoint(...)`.
- [ ] All level-* tests that used `ctx.endpoints(...)` migrated.
- [ ] README's cross-endpoint example uses `ctx.endpoint`.

## Blocked by

- 001 (final `EndpointHandle` shape)

## Notes

- Pure rename + delete; no behavior change.
