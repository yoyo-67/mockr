# Scenarios reference

Named server states. Useful for demos, e2e tests, and reproducing edge cases.

## Define

```ts
await mockr({
  endpoints: [
    { url: '/api/users', data: [{ id: 1, name: 'Alice' }] },
  ],
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
