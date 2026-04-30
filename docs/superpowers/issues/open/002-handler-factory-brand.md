# 002 — `handler({...})` factory with brand

**Type:** AFK
**Spec:** [`docs/superpowers/specs/2026-04-30-mock-writing-api-redesign-design.md`](../../specs/2026-04-30-mock-writing-api-redesign-design.md)
**Plan tasks:** 1

## What to build

`handler({...})` becomes the only legal shape for the `handler` field on `EndpointDef`. Raw functions are rejected. The factory return value carries a nominal symbol brand so boot-time validation can distinguish it from a plain function at runtime.

Schemas in `body`/`query`/`params` slots flow generic → typed `req.body` / `req.query` / `req.params` inside `fn` without manual casts.

## Acceptance criteria

- [ ] `src/handler.ts` exports: `handler({...})` factory, `HandlerSpec<TBody, TQuery, TParams, TEndpoints>` interface, `isHandlerSpec(value)` type guard, `HANDLER_SPEC_BRAND` symbol.
- [ ] `handler({...})` return value carries `[HANDLER_SPEC_BRAND]: true`. `isHandlerSpec` returns true for factory output, false for plain functions or arbitrary objects.
- [ ] Schema-bearing slots (`body`, `query`, `params`) flow to `fn`'s `req` parameter. Type test asserts: `handler({ body: zodSchema, fn: (req) => /* req.body typed */ })`.
- [ ] `src/index.ts` re-exports `handler` and `HandlerSpec` from the new module. The old inline `handler` function in `index.ts:43-50` is removed.
- [ ] Server invokes `spec.fn(req, ctx)` directly; the factory's role is purely type plumbing + branding.
- [ ] Tests: `tests/handler-factory.test.ts` (brand presence, isHandlerSpec discrimination, slot preservation).
- [ ] One existing example uses the factory shape end-to-end and runs.

## Blocked by

None — start immediately.

## Notes

- The brand is a `Symbol.for('mockr.HandlerSpec')` so cross-module imports share the identity.
- Validation that rejects raw-function `handler` lives in slice 8 (boot validator). This slice only needs to make the brand available; rejection is wired up later.
