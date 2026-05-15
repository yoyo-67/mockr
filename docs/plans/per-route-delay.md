# Per-route delay — implementation plan

Decisions: see `docs/adr/0001-per-route-delay.md`. TDD per slice (red → green → next).

## Slices

### 1. Type surface — `delay` field on `EndpointDef`
- `types.ts`: add `delay?: number | { min: number; max: number }` to all non-WS variants of `EndpointDef`. Add `delay?: never` to WS variant.
- `tests/types.test-d.ts` + `tests/public-api-surface.test-d.ts`: accept fixed/window forms, reject string/negative-at-type-level (TS won't catch negative; that's runtime), reject `delay` on WS endpoint.

### 2. Boot-time validation
- `config-validator.ts`: per-endpoint `delay` check. Reject `< 0`, `NaN`, `min > max`, missing `max` when `min` present (and vice versa), non-number values.
- `tests/config-validator.test.ts`: each bad input → aggregated error with index + URL.

### 3. Dispatch — apply delay pre-handler
- `server.ts`: in request flow, after global `pre` middleware loop and after route match, before handler/data dispatch:
  - Skip if endpoint disabled (proxy fallthrough owns timing).
  - Resolve effective delay: route-level `delay` if defined (including `0`); else any global `delay()` middleware in chain runs as today.
  - If route-level applies: sleep, set `X-Mockr-Delay: <actual ms>` on outgoing response.
- Override semantics: when route-level applies, skip any contribution from global `delay()` middleware for this request (need a way to tag or short-circuit — likely simpler to keep global middleware as-is and put the override decision at dispatch site by *not* invoking middleware named `delay` when route-level is set, OR by setting a request-level flag the middleware checks).
- `tests/level-X-route-delay.test.ts` (new level file): fixed-ms route delay; jitter window; override of global `delay()`; disabled endpoint = no delay; header present; `delay: 0` = no delay even with global set.

### 4. Runtime mutability — `setDelay()`
- `endpoint-handle.ts`: add `setDelay(value: number | { min: number; max: number } | null): void`. `null` clears route override → falls back to global middleware.
- Validation throws synchronously, same rules as boot.
- `tests/endpoint-handle-dispatch.test.ts` or new file: set/clear flow, validation throw, observable delay change on subsequent requests.

### 5. Control route — `PUT /__mockr/endpoints/:url/delay`
- `control-routes.ts`: parse encoded URL param, body `{ ms?: number, min?: number, max?: number } | null`, delegate to handle's `setDelay`.
- Return 400 with validator error message on bad input; 200 on success.
- `tests/control-routes-delay.test.ts` (new): set/clear via HTTP, error responses.

### 6. Scenario patching
- Verify existing scenario apply logic in `server.ts` flows `delay` through with same semantics as `data`/`handler`. Add explicit test even if no code change needed.
- `tests/level-6-scenarios.test.ts`: scenario sets `delay`, activate → delay applies, deactivate → baseline restored.

### 7. Public API export + docs
- `index.ts`: no new export needed (field is on existing `EndpointDef`).
- `README.md` / `docs/site/`: short paragraph + example.

## Order

1 → 2 → 3 → 4 → 5 → 6 → 7. Each slice fully green (unit + integration + typecheck via `npm test`) before next.

## Out of scope (deferred)

- Method-level `delay` inside `handler()` factory or `methods` map.
- TUI key binding to tweak delay live.
- Chrome extension UI for delay slider.
- Non-uniform jitter distributions (Gaussian, etc.).
- Global option `mockr({ exposeDelay: false })` to suppress `X-Mockr-Delay` header — add if any user complains.
