# 010 — `idKey` startup warning

**Type:** AFK
**Spec:** [`docs/superpowers/specs/2026-04-30-mock-writing-api-redesign-design.md`](../../specs/2026-04-30-mock-writing-api-redesign-design.md)
**Plan tasks:** 16

## What to build

Today, `idKey` defaults to `'id'` and silently falls back to array index when items lack the field. Junior with `_id` (Mongo) or custom keys gets mysterious bugs. Add a one-line warning at boot so the silent fallback is no longer silent.

## Acceptance criteria

- [ ] On boot, for every list endpoint with non-empty `data`, server checks: does at least one item have the configured `idKey`?
- [ ] If no items have the key, `console.warn` a message: `mockr: endpoint <url> — idKey '<idKey>' not found on items, defaulting to array index. Set idKey explicitly or add the field to your data.`
- [ ] Custom `idKey` (e.g. `idKey: 'uuid'`) does not trigger the warning when items have that field.
- [ ] Empty data arrays do not trigger the warning (no items to check).
- [ ] Record endpoints do not trigger the warning (no idKey concept).
- [ ] Runtime tests (TDD red → green) in `tests/id-key-warning.test.ts`: warning fires when items lack `id`; no warning when items have `id`; no warning when custom `idKey` matches; no warning on empty array; no warning on record endpoint.
- [ ] No other behavior change (warning only, fallback preserved).

## Blocked by

- 001 (list-handle module)

## Notes

- Default fallback (array index) preserved for backwards compatibility — only the silence is fixed.
