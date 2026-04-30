# 011 — Server-file-patcher emits v0.3.0 shape

**Type:** AFK
**Spec:** [`docs/superpowers/specs/2026-04-30-mock-writing-api-redesign-design.md`](../../specs/2026-04-30-mock-writing-api-redesign-design.md)
**Plan tasks:** 19

## What to build

The Chrome extension calls `/__mockr/map` to write recorded entries into the user's server file. The patcher must emit endpoint definitions in the v0.3.0 shape so the extension's "Map to mockr" round-trip produces code that compiles and runs against the new API.

## Acceptance criteria

- [ ] When the recorded body is an array, emit `data: <array>` (list endpoint).
- [ ] When the recorded body is an object, emit `data: <object>` (record endpoint).
- [ ] When the entry warrants a custom handler (per existing patcher logic), emit `handler: handler({ fn: () => ({ status, body }) })` — never a raw function. Add the `handler` import if missing.
- [ ] When emitting `dataFile` for typed JSON, prefer `dataFile: file<T>('./...')` and add the `file` import. Plain string fallback acceptable when type is unknown.
- [ ] Multiple methods on the same URL are emitted as a single entry with a `methods` map, not as separate array entries.
- [ ] Existing `body:` / `response:` emission paths are removed.
- [ ] Generated `Endpoints` type updates use array-form (`Foo[]`) for list endpoints, plain (`Foo`) for record endpoints — matches the spec rule that array shape drives kind.
- [ ] Runtime tests (TDD red → green) in `tests/server-file-patcher.test.ts` (extend existing or add new): emitted code contains `data:` not `body:`; handler emissions wrap in `handler({...})`; multi-method same-URL gets collapsed to a single entry with `methods` map; `dataFile` emission with known type uses `file<T>('./...')` and adds the import.
- [ ] Manual end-to-end: load extension, record a session, click "Map to mockr", verify generated server file boots without modification.

## Blocked by

- 001 (final `EndpointDef` shape)
- 002 (`handler` factory)
- 006 (`methods` map)

## Notes

- The patcher uses `ts-morph` to mutate user code — exercise care with import inference (deduplicate `handler` / `file` imports).
- Manual end-to-end check in addition to unit tests, because the extension itself is hard to unit-test.
