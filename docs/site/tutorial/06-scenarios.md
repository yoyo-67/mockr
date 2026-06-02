# 06 — Scenarios

Named server states you can switch between. Useful for demos, e2e tests, and reproducing edge cases.

::: tip Run this chapter in 30 seconds
1. **[Open in StackBlitz →](https://stackblitz.com/github/yoyo-67/mockr?file=examples/06-scenarios/server.ts)** — full Node sandbox in your browser, no install.
2. Wait for `npm install` to finish, then in the Terminal tab run:
   ```
   npx tsx examples/06-scenarios/server.ts
   ```
3. Paste any request from the *Try it* section below into the Terminal (use `curl` — the StackBlitz preview port is forwarded).
:::

## Concept

Two layers. **Per-endpoint scenarios** live on a verb spec — named alternates for *that* route, picked per request and never touching server state. **Config-level scenarios** are setup functions that reshape the whole server: on activation mockr resets every endpoint to its initial state, then runs the function.

## Per-endpoint scenarios

Put a `scenarios` map on a verb spec alongside `fn`. Each entry is a handler with the same signature. The active one is chosen per request by the `x-mockr-scenario` header or the `?_scenario=<name>` query param; with neither, `fn` runs. State stays untouched, so these are safe to flip mid-session.

```ts
import { mockr, mockGroup } from '@yoyo-org/mockr';

interface User { id: number; name: string; role: string }

type Endpoints = { '/api/users': User[] };

const api = mockGroup<Endpoints>()
  .data('/api/users', [
    { id: 1, name: 'Alice', role: 'admin' },
    { id: 2, name: 'Bob', role: 'viewer' },
  ])
  .get('/api/users', {
    fn: (_req, ctx) => ctx.endpoint('/api/users').data,
    scenarios: {
      empty: () => [],
      down: (_req, ctx) => ctx.error(503, 'Service temporarily unavailable'),
    },
  })
  .done();

mockr({ port: 3006, groups: [api] });
```

```bash
# default — Alice + Bob
curl -s http://localhost:3006/api/users

# "empty" via header
curl -s http://localhost:3006/api/users -H 'x-mockr-scenario: empty'    # []

# "down" via query param — 503
curl -s 'http://localhost:3006/api/users?_scenario=down' -i
```

## Config-level scenarios

When you need to reshape *several* endpoints at once — and keep that state until you switch away — use the config-level `scenarios` map. Each entry is a setup function; on activation mockr resets every endpoint, then runs it. Switch via `server.scenario(name)` programmatically or `POST /__mockr/scenario { "name": "..." }` from the browser.

```ts
import { mockr, mockGroup } from '@yoyo-org/mockr';

interface User { id: number; name: string; role: string }

type Endpoints = { '/api/users': User[] };

const api = mockGroup<Endpoints>()
  .data('/api/users', [
    { id: 1, name: 'Alice', role: 'admin' },
    { id: 2, name: 'Bob', role: 'viewer' },
  ])
  .done();

mockr<Endpoints>({
  port: 3006,
  groups: [api],
  scenarios: {
    empty: (s) => { s.endpoint('/api/users').clear(); },

    crowded: (s) => {
      const users = s.endpoint('/api/users');
      for (let i = 0; i < 10; i++) {
        users.insert({ name: `User ${i}`, role: 'viewer' } as User);
      }
    },

    down: (s) => {
      s.endpoint('/api/users').handler = () => ({
        status: 503, body: { error: 'Service temporarily unavailable' },
      });
    },
  },
});
```

## Try it

[**Open in StackBlitz →**](https://stackblitz.com/github/yoyo-67/mockr?file=examples/06-scenarios/server.ts) — paste each `curl` into the StackBlitz Terminal once `npx tsx examples/06-scenarios/server.ts` is running.

```bash
# default — Alice + Bob
curl -s http://localhost:3006/api/users

# switch to "empty"
curl -s -X POST http://localhost:3006/__mockr/scenario \
  -H 'Content-Type: application/json' \
  -d '{"name":"empty"}'
curl -s http://localhost:3006/api/users    # []

# switch to "down" — endpoint returns 503
curl -s -X POST http://localhost:3006/__mockr/scenario \
  -H 'Content-Type: application/json' \
  -d '{"name":"down"}'
curl -s http://localhost:3006/api/users -i

# back to baseline
curl -s -X POST http://localhost:3006/__mockr/scenario \
  -H 'Content-Type: application/json' \
  -d '{"name":null}'
```

## What's next

One URL, many verbs → [07 — Multi-method](./07-multi-method).
