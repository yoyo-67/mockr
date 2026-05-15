# Per-route delay

## Context

`delay()` exists today as a global middleware (`min`/`max` window, applied to every request). Real mocking workflows need per-route latency: simulate one slow endpoint while others stay fast, drive UI loading-state demos via scenarios, tweak latency mid-test. A middleware-level `include`/`exclude` filter would work but couples timing config to middleware ordering and forces a second list of routes to keep in sync with the endpoint registry.

## Decision

Add a `delay` field directly on `EndpointDef`:

```ts
{ url: '/api/users', data: [...], delay: 500 }
{ url: '/api/slow',  data: {...}, delay: { min: 100, max: 800 } }
```

Three follow-on decisions worth recording (the rest is mechanical):

1. **Per-route overrides global, never additive.** When both a global `delay()` middleware and a route-level `delay` apply, route wins; global is skipped for that request. `delay: 0` = explicit no-delay. Additive composition surprises the junior FE persona ("I set 500, why is it 700?"); override matches the existing `methods`-overrides-default-CRUD and scenarios-override-baseline patterns.

2. **Delay only fires on matched + enabled endpoints.** A disabled endpoint falls through to `proxy.target`; the upstream owns its own timing and artificial latency on top would mislead. Same reason `ctx.forward()` runs *after* the route delay rather than wrapping it — once the handler is executing, mid-handler timing is user-owned. Users wanting "slow proxy" reach for the global `delay()` middleware instead.

3. **WS endpoints reject `delay` at the type level (`delay?: never`).** HTTP timing semantics don't transfer cleanly to a persistent connection — "delay" could mean handshake latency, per-inbound-message wait, or per-outbound-message wait, and picking one silently is worse than rejecting it. Users can `await sleep()` inside `onMessage` if they need WS timing.

Endpoint-level applies to every verb in a `methods` map (no per-method delay slot inside `handler()` factory — keeps the schema/handler concern separate from timing). Validation throws at boot and symmetrically in `setDelay()`. Every delayed response carries `X-Mockr-Delay: <actual ms>` so the junior FE can verify "mockr-injected" vs "slow handler" without leaving the network tab.

## Considered options

- **Path filter on `delay()` middleware** (`delay({ ms: 500, include: ['/api/users'] })`) — rejected: couples timing to middleware ordering and duplicates the route list.
- **Map form on `delay()`** (`delay({ '/api/users': 500 })`) — rejected: same duplication problem, and route keys drift from real endpoint URLs silently.
- **Additive composition** — rejected: see decision 1.
- **Per-method delay** inside `handler()` factory — deferred: real demand is rare, and the manual `await sleep()` escape hatch covers it.
