// Feature: methods map — many verbs, one URL.
//
// Instead of repeating the URL across array entries, group verbs in a
// `methods: { GET, POST, PUT, ... }` object. May stand alone OR sit
// alongside `data`/`dataFile` to override specific verbs while default
// CRUD covers the rest. Verbs not in the map → 405 with `Allow` header.

import { mockr, handler } from '../../src/index.js';
import { z } from 'zod';

interface CartItem { id: number; product_id: number; quantity: number }

type Endpoints = {
  '/internal/cart': CartItem[];
};

const server = await mockr<Endpoints>({
  port: 3007,
  endpoints: [
    { url: '/internal/cart', data: [] },

    // Stand-alone methods map — handler per verb, no `data`/`dataFile` fallback.
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

console.log(`Multi-method example running at ${server.url}`);
console.log(`  GET    /api/cart                 list items`);
console.log(`  POST   /api/cart                 add item`);
console.log(`  DELETE /api/cart                 clear cart`);
console.log(`  PUT    /api/cart  →  405 Method Not Allowed (Allow: GET, POST, DELETE)`);
