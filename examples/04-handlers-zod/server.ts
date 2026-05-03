// Feature: handler({ body, query, params, fn }) with zod validation.
//
// Schemas in any of the three slots flow into `fn`'s `req` so `req.body`,
// `req.query`, `req.params` are typed without manual casts. Invalid
// requests get a 400 before `fn` runs.

import { mockr, handler } from '../../src/index.js';
import { z } from 'zod';

const server = await mockr({
  port: 3004,
  endpoints: [
    // Validate request body. Wrong shape → 400 with zod issue list.
    {
      url: '/api/orders',
      method: 'POST',
      handler: handler({
        body: z.object({
          user_id: z.string(),
          total: z.number().positive(),
        }),
        fn: (req) => {
          // req.body.user_id is string, req.body.total is number — typed.
          return { status: 201, body: { id: 'o-1', ...req.body } };
        },
      }),
    },

    // Validate query params + URL params together.
    {
      url: '/api/users/:userId/orders',
      method: 'GET',
      handler: handler({
        params: z.object({ userId: z.string() }),
        query: z.object({
          status: z.enum(['pending', 'shipped']).optional(),
          limit: z.coerce.number().min(1).max(100).optional(),
        }),
        fn: (req) => {
          return {
            body: {
              user: req.params.userId,
              status: req.query.status ?? 'all',
              limit: req.query.limit ?? 20,
            },
          };
        },
      }),
    },
  ],
});

console.log(`Handlers + zod example running at ${server.url}`);
console.log(`  POST   /api/orders                          (body schema)`);
console.log(`  GET    /api/users/:userId/orders?status=…   (params + query schema)`);
