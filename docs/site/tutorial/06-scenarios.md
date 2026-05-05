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

Each scenario is a setup function. When activated, mockr first resets every endpoint to its initial state, then runs the function. Switch via `server.scenario(name)` programmatically or `POST /__mockr/scenario { "name": "..." }` from the browser.

## Code

```ts
import { mockr } from '@yoyo-org/mockr';

interface User { id: number; name: string; role: string }

type Endpoints = { '/api/users': User[] };

mockr<Endpoints>({
  port: 3006,
  endpoints: [
    {
      url: '/api/users',
      data: [
        { id: 1, name: 'Alice', role: 'admin' },
        { id: 2, name: 'Bob', role: 'viewer' },
      ],
    },
  ],
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
