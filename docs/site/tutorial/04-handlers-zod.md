# 04 — Handlers + zod

`handler({ body, query, params, fn })` accepts optional zod schemas. Schema output flows into `req` so `req.body`, `req.query`, `req.params` are typed without manual casts.

[Open in StackBlitz →](https://stackblitz.com/github/yoyo-67/mockr/tree/experiments/examples/04-handlers-zod?file=server.ts)

## Concept

Invalid requests get a `400` with the zod issue list before `fn` runs. Each slot is independent — pass only the schemas you need.

## Code

```ts
import { mockr, handler } from '@yoyo-org/mockr';
import { z } from 'zod';

await mockr({
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

```http
POST http://localhost:3004/api/orders                         { "user_id": "u1", "total": 99 }
POST http://localhost:3004/api/orders                         { "user_id": "u1", "total": -1 }   # 400
GET  http://localhost:3004/api/users/u1/orders?status=shipped&limit=5
GET  http://localhost:3004/api/users/u1/orders?status=garbage                                    # 400
```

## What's next

Run logger / delay / auth around every request → [05 — Middleware](./05-middleware).
