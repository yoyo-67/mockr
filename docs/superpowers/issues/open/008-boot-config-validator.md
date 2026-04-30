# 008 — Boot config validator (aggregated, did-you-mean)

**Type:** AFK
**Spec:** [`docs/superpowers/specs/2026-04-30-mock-writing-api-redesign-design.md`](../../specs/2026-04-30-mock-writing-api-redesign-design.md)
**Plan tasks:** 8, 9

## What to build

`mockr({...})` validates the whole `endpoints` array before binding the port. On any failure, throws a single aggregated error listing every bad def by index + URL. Junior sees all typos at once instead of debugging silent misregistration.

## Acceptance criteria

- [ ] `src/config-validator.ts` exports `validateConfig(config)` returning `{ valid: true } | { valid: false; errors: ConfigError[] }` and `formatErrors(errors)` returning a human-readable string.
- [ ] Validations covered:
  - Unknown keys with did-you-mean suggestion (Levenshtein distance ≤ 2). Example: `dataFiel` → "did you mean 'dataFile'?".
  - Conflict pairs: `data + handler`, `data + dataFile`, `dataFile + handler`, `handler + methods`, `method + methods`.
  - `handler` field that is not a `HandlerSpec` brand result ("must be created by handler({...})").
  - `methods` map keys must be uppercase HTTP verbs (`get` is rejected with a clear message).
  - `methods` map values must be `HandlerSpec` brand results.
  - `dataFile` must be a string OR `FileRef`.
  - Duplicate URL+method across array entries.
- [ ] Aggregation: validator collects every error and returns them all (no early return).
- [ ] `mockr({...})` calls `validateConfig` first thing in its body. On `valid: false`, throws `new Error(formatErrors(errors))` before any I/O.
- [ ] Error string format:
  ```
  mockr: 3 endpoint definitions invalid:
    [0] /api/orders: 'dataFiel' is not a known key (did you mean 'dataFile'?)
    [2] /api/login: cannot set both 'data' and 'handler'
    [5] /api/users (GET): duplicate URL+method (also at index 7)
  ```
- [ ] Tests: `tests/config-validator.test.ts` (one test per error class + one aggregation test) and `tests/config-validator-integration.test.ts` (mockr boot rejects bad config).
- [ ] README mentions the validator behavior in a short troubleshooting note.

## Blocked by

- 001 (final `EndpointDef` shape)
- 002 (`HandlerSpec` brand to detect)
- 006 (methods map shape to validate)

## Notes

- Validator is a pure function over the config object — easy to unit-test exhaustively.
- The validator is the only enforcement point that distinguishes "junior typo'd a key" from "user wants extra metadata"; without it, runtime silently misregisters.
