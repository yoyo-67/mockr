# 004 — `file<T>()` typed dataFile factory

**Type:** AFK
**Spec:** [`docs/superpowers/specs/2026-04-30-mock-writing-api-redesign-design.md`](../../specs/2026-04-30-mock-writing-api-redesign-design.md)
**Plan tasks:** 2

## What to build

`file<T>('./path')` returns a branded path string. Runtime = string, type-level carries `T` so `EndpointHandle<T>` is correctly typed without compile-time JSON imports (which would break hot-reload).

Server accepts both branded `FileRef` and plain string for `dataFile` field — plain string remains valid (untyped fallback), branded form unlocks types.

## Acceptance criteria

- [ ] `src/file.ts` exports `file<T>(path)`, `FileRef<T>` interface, `isFileRef(value)` guard, `getFilePath(ref)` accessor, `FILE_REF_BRAND` symbol.
- [ ] `src/index.ts` re-exports `file` and `FileRef`.
- [ ] Type carries `T` via phantom `__type?: T` field that is never read at runtime.
- [ ] Server's `dataFile` registration accepts both `string` and `FileRef`. When a `FileRef` is passed, `isFileRef` is true and `getFilePath` returns the underlying path.
- [ ] `EndpointDef` types `dataFile: FileRef<T> | string`. When user passes `file<T[]>('./x.json')`, `server.endpoint('/url')` is `ListHandle<T>`. When user passes `file<T>('./x.json')` (object T), it is `RecordHandle<T>`.
- [ ] Tests: `tests/file-factory.test.ts` (brand presence, path accessor, runtime identity), `tests/api-redesign.test-d.ts` includes a `file<T>()` type assertion.
- [ ] One example uses `file<T[]>('./data.json')` and the resulting handle is typed.
- [ ] README documents the factory under "Typed dataFile".

## Blocked by

- 001 (needs `EndpointHandle<T>` conditional type to consume the carried `T`)

## Notes

- Plain `dataFile: './x.json'` keeps working for users who don't care about types.
