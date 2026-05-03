# Local issues

Vertical slices for ongoing work. Three states:

- `open/`   — not started or in progress
- `done/`   — merged / shipped
- `closed/` — won't-do / dropped (with reason in body)

Each file is one issue. Filename convention: `NNN-short-title.md`.

Move files between folders to change state. Do not delete.

## Current scope: v0.3.0 mock-writing API redesign

Spec: [`../specs/2026-04-30-mock-writing-api-redesign-design.md`](../specs/2026-04-30-mock-writing-api-redesign-design.md)
Plan: [`../plans/2026-04-30-mock-writing-api-redesign.md`](../plans/2026-04-30-mock-writing-api-redesign.md)

### Dependency graph

```
001 (handle conditional + single data) ─┬─ 003 (endpoints<T>)
                                        ├─ 004 (file<T>) ─── 005 (hot-reload)
002 (handler factory + brand) ──────────┼─ 006 (methods map) ─┬─ 008 (validator)
                                        ├─ 007 (ctx.endpoint)  │
                                        ├─ 010 (idKey warning) │
                                        ├─ 011 (patcher emit)  │
                                        └─ 009 (scenarios) ────┘
                                                               │
all of the above ─────────────────────── 012 (README + examples) ── DONE
```

## Conventions (apply to every issue)

**TDD always.** Red → green → refactor for every acceptance criterion that touches code:

1. Write the failing test first. Run it; confirm the failure message points at the missing thing (not at a typo).
2. Write the minimal implementation that makes the test pass. No extras, no speculative branches.
3. Refactor while green. Re-run after each refactor.
4. Commit at green points (one criterion = one commit, ideally).

Do not write implementation before the test exists.

**Type tests via `expectTypeOf` from `vitest`.** Any issue that adds or changes a public type MUST include a `.test-d.ts` file under `tests/` covering:

- positive cases (correct usage compiles)
- negative cases (incorrect usage is a type error — use `// @ts-expect-error`)
- inference cases (generic flow, conditional types, brand preservation)

Example pattern:

```ts
import { expectTypeOf } from 'vitest';
import { handler } from '../src/index.js';

const z = { safeParse: (d: unknown) => ({ success: true as const, data: d as { name: string } }) };
const h = handler({ body: z, fn: (req) => ({ body: { ok: req.body.name } }) });

expectTypeOf(h.fn).parameter(0).toHaveProperty('body').toEqualTypeOf<{ name: string }>();

// @ts-expect-error — methods keys must be uppercase
endpoints<Endpoints>([{ url: '/x', methods: { get: h } }]);
```

Run runtime tests with `npm test`. Run type tests with `npx vitest run --config vitest.typecheck.config.ts`.

**No `as any` or `as unknown` casts in production code.** If types fight you, fix the types.

**Commit at every green chunk.** Per acceptance criterion, ideally. Minimum: one commit per logical group of related criteria. Commit messages use conventional-commits prefix (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`). Don't batch unrelated work into one commit. Don't commit red.

When an issue is fully done, move the file from `open/` to `done/` in the same commit (or a follow-up commit) so the folder reflects state.

---

### Suggested order

Parallel-safe waves:

1. **Wave 1**: 001, 002 (foundation, no deps)
2. **Wave 2**: 003, 004, 006, 007, 010, 011 (depend on 1+2 only)
3. **Wave 3**: 005 (needs 004), 008 (needs 006), 009 (needs 006)
4. **Wave 4**: 012 (HITL, needs everything)
