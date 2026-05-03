# 06 — Scenarios

Named server states you can switch between. Useful for demos, e2e tests, and reproducing edge cases.

[Open in StackBlitz →](https://stackblitz.com/github/yoyo-67/mockr/tree/experiments/examples/06-scenarios?file=server.ts)

## Concept

Each scenario is a setup function. When activated, mockr first resets every endpoint to its initial state, then runs the function. Switch via `server.scenario(name)` programmatically or `POST /__mockr/scenario { "name": "..." }` from the browser.

## Code

```ts
import { mockr } from '@yoyo-org/mockr';

interface User { id: number; name: string; role: string }

type Endpoints = { '/api/users': User[] };

await mockr<Endpoints>({
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

```http
GET  http://localhost:3006/api/users                          # default state
POST http://localhost:3006/__mockr/scenario   { "name": "empty" }
GET  http://localhost:3006/api/users                          # []
POST http://localhost:3006/__mockr/scenario   { "name": "down" }
GET  http://localhost:3006/api/users                          # 503
```

## What's next

One URL, many verbs → [07 — Multi-method](./07-multi-method).
