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
import { mockr, handler } from '@yoyo-org/mockr';

interface Product { id: number; name: string; price: number; stock: number }
interface CartItem { id: number; product_id: number; quantity: number }

type Endpoints = {
  '/internal/products': Product[];
  '/internal/cart': CartItem[];
};

mockr<Endpoints>({
  port: 3003,
  endpoints: [
    { url: '/internal/products', data: [/* ... */] },
    { url: '/internal/cart', data: [] },

    {
      url: '/api/cart',
      method: 'POST',
      handler: handler({ fn: (req, ctx) => {
        const { product_id, quantity } = req.body as { product_id: number; quantity: number };
        const products = ctx.endpoint('/internal/products');
        const cart = ctx.endpoint('/internal/cart');

        const product = products.findById(product_id);
        if (!product) return { status: 404, body: { error: 'not found' } };
        if (product.stock < quantity) return { status: 400, body: { error: 'out of stock' } };

        products.update(product_id, { stock: product.stock - quantity });
        const item = cart.insert({ product_id, quantity } as CartItem);
        return { status: 201, body: { item } };
      } }),
    },
  ],
});
```

## Try it

```http
GET  http://localhost:3003/api/cart
POST http://localhost:3003/api/cart   { "product_id": 1, "quantity": 2 }
GET  http://localhost:3003/api/cart
```

The first GET joins cart × products and computes a total. The POST decrements stock on `/internal/products` and inserts into `/internal/cart` — atomic from the client's perspective.

## What's next

Validate request body / query / params with zod schemas → [04 — Handlers + zod](./04-handlers-zod).
