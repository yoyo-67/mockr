# 003 — `endpoints<T>()` group helper

**Type:** AFK
**Spec:** [`docs/superpowers/specs/2026-04-30-mock-writing-api-redesign-design.md`](../../specs/2026-04-30-mock-writing-api-redesign-design.md)
**Plan tasks:** 3

## What to build

`endpoints<T>()` helper for splitting mocks across files. Runtime is a no-op (returns input). Type-level: each item's URL must exist in `T`, `data` must match `T[url]`, `ctx.endpoint(url)` inside group handlers is typed against `T`.

Top-level `mockr<E>({ endpoints: [...] })` keeps its explicit generic. Multiple groups compose via intersection: `type E = A & B; mockr<E>({ endpoints: [...aMocks, ...bMocks] })`.

## Acceptance criteria

- [ ] `src/endpoints-helper.ts` exports `endpoints<T>(defs)` returning the same array unchanged.
- [ ] `src/index.ts` re-exports `endpoints`.
- [ ] Runtime tests (TDD red → green) in `tests/endpoints-helper.test.ts`: identity (returns same array), accepts empty array.
- [ ] Type tests via `expectTypeOf` in `tests/endpoints-helper.test-d.ts`: `// @ts-expect-error` on `endpoints<E>([{ url: '/notInE', data: [] }])`; correct URLs pass; `data` shape mismatch (`endpoints<{ '/x': Foo[] }>([{ url: '/x', data: [bar] }])`) is a type error; `ctx.endpoint(url)` inside a handler is typed against `T`; intersection composition (`type E = A & B`) accepts `[...aMocks, ...bMocks]`.
- [ ] `playground/server.ts` (or one example) uses `endpoints<T>()` to declare a group; top-level `mockr<E>()` spreads it.
- [ ] README has a "Splitting mocks across files" section showing the group + intersection composition pattern.

## Blocked by

- 001 (needs final `EndpointDef` shape)
- 002 (needs `HandlerSpec` branded type)

## Notes

- The runtime is intentionally trivial; the value is entirely in the type-level constraint.
