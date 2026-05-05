# 04 — Handlers + zod

`handler({ body, query, params, fn })` accepts optional zod schemas. Schema output flows into `req` so `req.body`, `req.query`, `req.params` are typed without manual casts.

::: tip Run this chapter in 30 seconds
1. **[Open in StackBlitz →](https://stackblitz.com/github/yoyo-67/mockr?file=examples/04-handlers-zod/server.ts)** — full Node sandbox in your browser, no install.
2. Wait for `npm install` to finish, then in the Terminal tab run:
   ```
   npx tsx examples/04-handlers-zod/server.ts
   ```
3. Paste any request from the *Try it* section below into the Terminal (use `curl` — the StackBlitz preview port is forwarded).
:::

## Concept

Invalid requests get a `400` with the zod issue list before `fn` runs. Each slot is independent — pass only the schemas you need.

## Code

```ts
import { mockr, handler } from '@yoyo-org/mockr';
import { z } from 'zod';

mockr({
  port: 3004,
  endpoints: [
    {
      url: '/api/orders',
      method: 'POST',
      handler: handler({
        body: z.object({ user_id: z.string(), total: z.number().positive() }),
        fn: (req) => {
          // req.body.user_id is string, req.body.total is number — typed.
          return { status: 201, body: { id: 'o-1', ...req.body } };
        },
      }),
    },

    {
      url: '/api/users/:userId/orders',
      method: 'GET',
      handler: handler({
        params: z.object({ userId: z.string() }),
        query: z.object({
          status: z.enum(['pending', 'shipped']).optional(),
          limit: z.coerce.number().min(1).max(100).optional(),
        }),
        fn: (req) => ({
          body: {
            user: req.params.userId,
            status: req.query.status ?? 'all',
            limit: req.query.limit ?? 20,
          },
        }),
      }),
    },
  ],
});
```

## Try it

[**Open in StackBlitz →**](https://stackblitz.com/github/yoyo-67/mockr?file=examples/04-handlers-zod/server.ts) — paste each `curl` into the StackBlitz Terminal once `npx tsx examples/04-handlers-zod/server.ts` is running.

```bash
# valid body — 201
curl -s -X POST http://localhost:3004/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"u1","total":99}'

# invalid body (negative total) — 400 + zod issue list
curl -s -X POST http://localhost:3004/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"u1","total":-1}' -i

# valid query + params
curl -s 'http://localhost:3004/api/users/u1/orders?status=shipped&limit=5'

# invalid query (bad enum) — 400
curl -s 'http://localhost:3004/api/users/u1/orders?status=garbage' -i
```

## What's next

Run logger / delay / auth around every request → [05 — Middleware](./05-middleware).
