# 07 — Multi-method

Many HTTP verbs on the same URL — group them in a `methods` map instead of repeating the URL across array entries.

::: tip Run this chapter in 30 seconds
1. **[Open in StackBlitz →](https://stackblitz.com/github/yoyo-67/mockr?file=examples/07-multi-method/server.ts)** — full Node sandbox in your browser, no install.
2. Wait for `npm install` to finish, then in the Terminal tab run:
   ```
   npx tsx examples/07-multi-method/server.ts
   ```
3. Paste any request from the *Try it* section below into the Terminal (use `curl` — the StackBlitz preview port is forwarded).
:::

## Concept

`methods` maps verb → handler. Verbs not in the map respond `405 Method Not Allowed` with an `Allow` header listing the supported verbs. The map can stand alone (no data fallback) or sit alongside `data`/`dataFile` to override specific verbs while default CRUD covers the rest.

## Code

```ts
import { mockr, handler } from '@yoyo-org/mockr';
import { z } from 'zod';

interface CartItem { id: number; product_id: number; quantity: number }

type Endpoints = { '/internal/cart': CartItem[] };

mockr<Endpoints>({
  port: 3007,
  endpoints: [
    { url: '/internal/cart', data: [] },

    {
      url: '/api/cart',
      methods: {
        GET: handler({
          fn: (_req, ctx) => ({ body: ctx.endpoint('/internal/cart').data }),
        }),
        POST: handler({
          body: z.object({ product_id: z.number(), quantity: z.number() }),
          fn: (req, ctx) => {
            const item = ctx.endpoint('/internal/cart').insert(req.body as CartItem);
            return { status: 201, body: { item } };
          },
        }),
        DELETE: handler({
          fn: (_req, ctx) => {
            ctx.endpoint('/internal/cart').clear();
            return { status: 204, body: '' };
          },
        }),
      },
    },
  ],
});
```

## Try it

[**Open in StackBlitz →**](https://stackblitz.com/github/yoyo-67/mockr?file=examples/07-multi-method/server.ts) — paste each `curl` into the StackBlitz Terminal once `npx tsx examples/07-multi-method/server.ts` is running.

```bash
# read cart
curl -s http://localhost:3007/api/cart

# add line
curl -s -X POST http://localhost:3007/api/cart \
  -H 'Content-Type: application/json' \
  -d '{"product_id":1,"quantity":2}'

# clear
curl -s -X DELETE http://localhost:3007/api/cart -i

# unsupported verb — 405 + Allow header
curl -s -X PUT http://localhost:3007/api/cart -i
```

## What's next

Forward unmatched routes to a real backend → [08 — Proxy](./08-proxy).
