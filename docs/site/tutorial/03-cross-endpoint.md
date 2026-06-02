# 03 — Cross-endpoint joins

Inside a handler, `ctx.endpoint(url)` gives a typed handle to any other endpoint's data.

::: tip Run this chapter in 30 seconds
1. **[Open in StackBlitz →](https://stackblitz.com/github/yoyo-67/mockr?file=examples/03-cross-endpoint/server.ts)** — full Node sandbox in your browser, no install.
2. Wait for `npm install` to finish, then in the Terminal tab run:
   ```
   npx tsx examples/03-cross-endpoint/server.ts
   ```
3. Paste any request from the *Try it* section below into the Terminal (use `curl` — the StackBlitz preview port is forwarded).
:::

## Concept

Convention: `/internal/*` endpoints hold source-of-truth data. `/api/*` endpoints are thin handlers that join, filter, or mutate them. The frontend never calls `/internal/*` directly.

`ctx.endpoint('/internal/products')` returns a `ListHandle<Product>` (or `RecordHandle<T>` for object data) — typed against the `Endpoints` map.

## Code

```ts
import { mockr, mockGroup } from '@yoyo-org/mockr';

interface Product { id: number; name: string; price: number; stock: number }
interface CartItem { id: number; product_id: number; quantity: number }

type Endpoints = {
  '/internal/products': Product[];
  '/internal/cart': CartItem[];
  '/api/cart': { item: CartItem };
};

const shop = mockGroup<Endpoints>()
  .data('/internal/products', [/* ... */])
  .data('/internal/cart', [])
  .post('/api/cart', (req, ctx) => {
    const { product_id, quantity } = req.body as { product_id: number; quantity: number };
    const products = ctx.endpoint('/internal/products');
    const cart = ctx.endpoint('/internal/cart');

    const product = products.findById(product_id);
    if (!product) return ctx.error(404, 'not found');
    if (product.stock < quantity) return ctx.error(400, 'out of stock');

    products.update(product_id, { stock: product.stock - quantity });
    const item = cart.insert({ product_id, quantity } as CartItem);
    return ctx.created({ item });
  })
  .done();

mockr({ port: 3003, groups: [shop] });
```

## Try it

[**Open in StackBlitz →**](https://stackblitz.com/github/yoyo-67/mockr?file=examples/03-cross-endpoint/server.ts) — paste each `curl` into the StackBlitz Terminal once `npx tsx examples/03-cross-endpoint/server.ts` is running.

```bash
# empty cart
curl -s http://localhost:3003/api/cart

# add a line — decrements /internal/products stock atomically
curl -s -X POST http://localhost:3003/api/cart \
  -H 'Content-Type: application/json' \
  -d '{"product_id":1,"quantity":2}'

# cart now joined with products + computed total
curl -s http://localhost:3003/api/cart
```

The first GET joins cart × products and computes a total. The POST decrements stock on `/internal/products` and inserts into `/internal/cart` — atomic from the client's perspective.

## What's next

Validate request body / query / params with zod schemas → [04 — Handlers + zod](./04-handlers-zod).
