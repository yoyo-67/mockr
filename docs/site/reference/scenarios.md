# Scenarios reference

Named server states. Useful for demos, e2e tests, and reproducing edge cases.

## Per-endpoint scenarios

A verb spec can carry named alternates next to its `fn`. Each is a full handler with the same `(req, ctx)` signature and return rules:

```ts
mockGroup<Endpoints>()
  .get('/api/users', {
    scenarios: {
      empty: () => [],
      boom:  (_req, ctx) => ctx.error(503, 'service down'),
    },
    fn: (_req, ctx) => ctx.endpoint('/internal/users').data,
  })
  .done();
```

mockr picks one per request from the `x-mockr-scenario` header or the `?_scenario=<name>` query param; with neither (or an unknown name) it falls back to `fn`.

```http
GET /api/users                         # → fn (baseline)
GET /api/users?_scenario=empty         # → []
GET /api/users   x-mockr-scenario: boom # → 503
```

Because the selector rides on the request, a Cypress / Playwright test can flip one endpoint per call — no server state to set or unwind. Different endpoints stay independent.

## Config-level scenarios

The config-level `scenarios` map mutates the *whole server* by name — patch stores, swap handlers, take a route down:

```ts
await mockr({
  groups: [mocks],
  scenarios: {
    empty: (s) => { s.endpoint('/api/users').clear(); },
    crowded: (s) => {
      const users = s.endpoint('/api/users');
      users.insert({ name: 'Bob' });
      users.insert({ name: 'Carol' });
    },
    down: (s) => {
      s.endpoint('/api/users').handler = () => ({
        status: 503, body: { error: 'service down' },
      });
    },
  },
});
```

Each scenario is `(server: MockrServer) => void | Promise<void>`. It runs against a freshly-`reset()` server, so changes don't leak between switches.

## Switch

```ts
await server.scenario('empty');     // programmatic
await server.scenario(null);        // back to baseline
```

```http
POST /__mockr/scenario   { "name": "down" }
GET  /__mockr/scenario                          # current name or null
```

The HTTP control surface lets a Cypress / Playwright test flip scenarios per spec without restarting mockr.

## Reset semantics

`server.reset()` (or switching to a different scenario) restores every endpoint's baseline via deep copy. `dataFile` endpoints reset to **the latest file content**, not the original — so editing the JSON between switches sticks.
