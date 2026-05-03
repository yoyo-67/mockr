// Feature: ctx.endpoint(url).
//
// One handler reads/writes data that lives on a different endpoint.
// Pattern: `/internal/*` endpoints hold the source-of-truth data, `/api/*`
// endpoints are thin handlers that join, filter, or mutate them.

import { mockr, handler } from '../../src/index.js';

interface Product { id: number; name: string; price: number; stock: number }
interface CartItem { id: number; product_id: number; quantity: number }

type Endpoints = {
  '/internal/products': Product[];
  '/internal/cart': CartItem[];
};

mockr<Endpoints>({
  port: 3003,
  endpoints: [
    // Source data — kept off the public surface.
    {
      url: '/internal/products',
      data: [
        { id: 1, name: 'Mechanical Keyboard', price: 75, stock: 24 },
        { id: 2, name: 'USB-C Hub', price: 35, stock: 50 },
        { id: 3, name: 'Standing Desk', price: 450, stock: 5 },
      ],
    },
    { url: '/internal/cart', data: [] },

    // Cross-endpoint read: enrich cart items with product details + total.
    {
      url: '/api/cart',
      method: 'GET',
      handler: handler({ fn: (_req, ctx) => {
        const products = ctx.endpoint('/internal/products');
        const cart = ctx.endpoint('/internal/cart');

        const items = cart.data.map((item) => {
          const product = products.findById(item.product_id);
          return {
            ...item,
            product_name: product?.name ?? 'Unknown',
            subtotal: (product?.price ?? 0) * item.quantity,
          };
        });
        const total = items.reduce((sum, i) => sum + i.subtotal, 0);
        return { body: { items, total } };
      } }),
    },

    // Cross-endpoint write: validate against products, decrement stock, push to cart.
    {
      url: '/api/cart',
      method: 'POST',
      handler: handler({ fn: (req, ctx) => {
        const { product_id, quantity } = req.body as { product_id: number; quantity: number };
        const products = ctx.endpoint('/internal/products');
        const cart = ctx.endpoint('/internal/cart');

        const product = products.findById(product_id);
        if (!product) return { status: 404, body: { error: `Product ${product_id} not found` } };
        if (product.stock < quantity) return { status: 400, body: { error: `Only ${product.stock} in stock` } };

        products.update(product_id, { stock: product.stock - quantity });
        const item = cart.insert({ product_id, quantity } as CartItem);
        return { status: 201, body: { item } };
      } }),
    },
  ],
});

console.log(`Cross-endpoint example running at http://localhost:3003`);
console.log(`  GET    /api/cart        (joins /internal/products + /internal/cart)`);
console.log(`  POST   /api/cart        (mutates both endpoints atomically)`);
