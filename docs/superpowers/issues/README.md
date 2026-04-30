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

### Suggested order

Parallel-safe waves:

1. **Wave 1**: 001, 002 (foundation, no deps)
2. **Wave 2**: 003, 004, 006, 007, 010, 011 (depend on 1+2 only)
3. **Wave 3**: 005 (needs 004), 008 (needs 006), 009 (needs 006)
4. **Wave 4**: 012 (HITL, needs everything)
