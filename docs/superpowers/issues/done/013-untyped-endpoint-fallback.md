# 013 — `EndpointHandle<unknown>` fallback for untyped callers

**Type:** AFK
**Spec:** [`docs/superpowers/specs/2026-04-30-mock-writing-api-redesign-design.md`](../../specs/2026-04-30-mock-writing-api-redesign-design.md)
**Discovered during:** issue 001 implementation review

## Problem

Issue 001 introduced a conditional `EndpointHandle<T>`:

```ts
type EndpointHandle<T> =
  T extends readonly any[]
    ? ListHandle<...>
    : T extends object
      ? RecordHandle<T>
      : never;
```

When a caller does NOT pass an `Endpoints` generic (e.g. `mockr({...})` without `<E>`, or in the recorder/integration paths that operate on unknown URLs), `T` falls to `unknown`. `unknown extends readonly any[]` is `false`, `unknown extends object` is `false`, so `EndpointHandle<unknown>` resolves to `never`. Property access (`.data`, `.findById`, `.set`) on `never` is a type error.

`recorder-integration.test.ts` already shows real symptoms (`Property 'data' does not exist on type 'never'`). Tests pass at runtime because the value exists; the type system is the problem.

## What to build

Provide a usable union fallback when `T` is `unknown` (or any type that doesn't narrow to array-or-object). Callers should get the SUPERSET of methods (so `.data`, `.findById`, `.set` all type-check), with each method taking `unknown` / returning `unknown` where appropriate.

Concretely:

```ts
type AnyEndpointHandle =
  | ListHandle<unknown>
  | RecordHandle<Record<string, unknown>>;

type EndpointHandle<T = unknown> =
  unknown extends T
    ? AnyEndpointHandle
    : T extends readonly any[]
      ? ListHandle<T extends readonly (infer U)[] ? U : never>
      : T extends object
        ? RecordHandle<T>
        : never;
```

The `unknown extends T` test (rather than `T extends unknown`) only triggers when `T` is exactly `unknown` — typed callers still get the precise narrowed handle.

## Acceptance criteria

- [ ] Type tests via `expectTypeOf` in `tests/endpoint-handle.test-d.ts` (extend existing):
  - `EndpointHandle<Foo[]>` is `ListHandle<Foo>` (unchanged).
  - `EndpointHandle<{ a: 1 }>` is `RecordHandle<{ a: 1 }>` (unchanged).
  - `EndpointHandle<unknown>` is the union; `.data` is accessible; `.findById(1)` is accessible (returns `unknown`); `.set(patch)` is accessible.
  - `EndpointHandle<string>` stays `never` (primitives still rejected).
- [ ] All existing recorder-integration / level-* tests that touched untyped handles type-check cleanly under IDE LSP.
- [ ] `npm test` stays green (188+ runtime, 57+ type tests).
- [ ] No `as any` introduced.

## Blocked by

None — can start immediately. Best done before issues 008 / 009 / 011 expand the surface.

## Notes

- Pure type change. No runtime impact.
- Watch out for distributivity quirks: `[T] extends [readonly any[]]` (with brackets) avoids accidental distribution over union types.
