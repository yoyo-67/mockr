# 012 — README rewrite + examples migration

**Type:** HITL
**Spec:** [`docs/superpowers/specs/2026-04-30-mock-writing-api-redesign-design.md`](../../specs/2026-04-30-mock-writing-api-redesign-design.md)
**Plan tasks:** 17, 21, 22

## What to build

Final rewrite of README and migration of every example + playground file to the v0.3.0 API. After this, a junior FE dev cloning the repo can read the README, copy-paste the first example, and have a working mock server in 5 minutes.

This is HITL because tone, ordering, and emphasis affect onboarding success and need a human eye.

## Acceptance criteria

- [ ] README sections (in order):
  1. Setup (`npm install`, `tsx` runner)
  2. Quick example (todo, single `data` array, full CRUD)
  3. Four building blocks (`data` for list & record, `dataFile`, `handler`, `methods`)
  4. Hot reload
  5. Validation (`handler({ body: zodSchema })`, typed `req.body`)
  6. Cross-endpoint (`ctx.endpoint(url).data`)
  7. Multi-verb endpoints (`methods` map)
  8. Scenarios (declarative + `baseline()`)
  9. Splitting mocks across files (`endpoints<T>()` + intersection)
  10. Typed dataFile (`file<T>()`)
  11. Chrome extension (Record & Map)
  12. CLI options
  13. API reference
  14. License
- [ ] No lingering `body:` (response shorthand) in any code block. No raw-function `handler:`. No `ctx.endpoints` (plural).
- [ ] Every example file (`examples/todo`, `examples/auth-api`, `examples/ecommerce`, `examples/chat`, `examples/proxy`) uses the new shape and boots successfully.
- [ ] `playground/server.ts` uses the new shape.
- [ ] `package.json` version bumped to `0.3.0`.
- [ ] `npm test` is green (runtime + typecheck).
- [ ] `npm run build` succeeds.
- [ ] Smoke check: `npx tsx examples/todo/server.ts` and at least one other example respond on their documented endpoints.

## Blocked by

- 001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 011 (all code slices)

## Notes

- This is the last slice. Until it ships, the codebase is intermediate state.
- Treat the README as the headline product surface — every code block is a mini-spec for downstream behavior.
