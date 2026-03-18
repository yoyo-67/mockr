# mockr

[![npm](https://img.shields.io/npm/v/@yoyo-org/mockr)](https://www.npmjs.com/package/@yoyo-org/mockr)

Mock API server for frontend prototyping. Define endpoints with data, get full CRUD for free. Mock the routes you're building, proxy the rest to a real backend.

## Setup

```bash
npm install @yoyo-org/mockr zod
```

Add `"type": "module"` to your `package.json`, create a server file (e.g. `mock.ts`), and run it with:

```bash
npx tsx mock.ts
```

No `tsconfig.json` or build step needed — `tsx` runs TypeScript directly.

## Quick example

```ts
import { mockr, handler } from '@yoyo-org/mockr';
import { z } from 'zod';

const server = await mockr({
  port: 4000,
  endpoints: [
    { url: '/api/orders', data: [{ id: 1, status: 'pending' }] },
    {
      url: '/api/orders/ship',
      method: 'POST',
      handler: handler({
        body: z.object({ id: z.number() }),
        fn: (req, { endpoints }) => {
          const orders = endpoints('/api/orders');
          orders.update(req.body.id, { status: 'shipped' });
          return { body: { ok: true } };
        },
      }),
    },
  ],
});

// GET  /api/orders/1  → { id: 1, status: 'pending' }
// POST /api/orders/ship { id: 1 }
// GET  /api/orders/1  → { id: 1, status: 'shipped' }
//
// One data source, multiple routes — mutations are visible everywhere.
```

## How it works

Give any URL a `data` array and mockr gives you a live, mutable REST API — GET, POST, PUT, PATCH, DELETE out of the box. Fetch it, modify it, fetch it again — changes persist in memory across requests. Every endpoint is stateful by default.

```ts
import { mockr, handler } from '@yoyo-org/mockr';
import { z } from 'zod';

interface Order {
  id: string;
  user_id: string;
  status: string;
  total: number;
}

type Endpoints = {
  '/internal/orders': Order;
};

const server = await mockr<Endpoints>({
  port: 4000,
  proxy: { target: 'https://your-backend.example.com' },
  endpoints: [
    // Data lives here — not called by the frontend directly
    {
      url: '/internal/orders',
      data: [
        { id: 'o1', user_id: 'u1', status: 'pending', total: 150 },
        { id: 'o2', user_id: 'u2', status: 'shipped', total: 89 },
        { id: 'o3', user_id: 'u1', status: 'shipped', total: 230 },
      ],
    },

    // List orders with optional status filter
    {
      url: '/api/orders',
      method: 'GET',
      handler: handler({
        query: z.object({ status: z.string().optional() }),
        fn: (req, { endpoints }) => {
          const orders = endpoints('/internal/orders');
          const { status } = req.query;
          const results = status ? orders.where({ status }) : orders.data;
          return { body: { orders: results, total: results.length } };
        },
      }),
    },

    // Batch status change — updates multiple orders at once
    {
      url: '/api/orders/batch-update',
      method: 'POST',
      handler: handler({
        body: z.object({ order_ids: z.array(z.string()), status: z.string() }),
        fn: (req, { endpoints }) => {
          const { order_ids, status } = req.body;
          const orders = endpoints('/internal/orders');
          const updated = orders.updateMany(order_ids, { status });
          return { body: { updated } };
        },
      }),
    },

    // Per-user orders
    {
      url: '/api/users/:userId/orders',
      method: 'GET',
      handler: handler({
        params: z.object({ userId: z.string() }),
        fn: (req, { endpoints }) => {
          const orders = endpoints('/internal/orders');
          const userOrders = orders.where((o) => o.user_id === req.params.userId);
          return { body: { orders: userOrders } };
        },
      }),
    },
  ],
});

// Typed endpoint access
const orders = server.endpoint('/internal/orders');
orders.data;              // Order[]
orders.findById('o1');    // Order | undefined
orders.where({ status: 'shipped' }); // Order[]
```

### Load data from files

Keep your mock data in JSON files instead of inlining it:

```ts
const server = await mockr({
  port: 4000,
  endpoints: [
    { url: '/api/todos', dataFile: './todos.json' },    // array → CRUD
    { url: '/api/config', bodyFile: './config.json' },   // object → static
  ],
});
```

---

## CLI options

Override config values from the command line:

```bash
npx tsx mock.ts --port 3000
npx tsx mock.ts --proxy https://api.example.com
npx tsx mock.ts --help
```

| Flag | Description |
|---|---|
| `--port <number>` | Port to listen on (overrides the port in your config) |
| `--proxy <url>` | Proxy unmatched requests to this URL |
| `--help`, `-h` | Show help message |

---

## API reference

### `EndpointHandle`

| Method | Description |
|---|---|
| `data` | Direct access to the data array |
| `findById(id)` | Find item by id |
| `where(filter)` | Filter by object match or predicate |
| `first()` | First item |
| `count()` | Number of items |
| `has(id)` | Check if id exists |
| `insert(item)` | Add item (returns with generated id) |
| `update(id, patch)` | Partial update |
| `updateMany(ids, patch)` | Update multiple items. `patch` can be an object or `(item) => Partial<T>` |
| `patch(id, fields, defaults?)` | Apply only non-undefined fields, then unconditional defaults |
| `remove(id)` | Delete by id |
| `clear()` | Remove all items |
| `reset()` | Restore original data |
| `save(path)` | Save this endpoint to file |

See [`examples/`](./examples) for more usage patterns.

## License

MIT

