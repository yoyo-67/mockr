# mockr

[![npm](https://img.shields.io/npm/v/@yoyo-org/mockr)](https://www.npmjs.com/package/@yoyo-org/mockr)

Mock API server for frontend prototyping. Define endpoints with data, get full CRUD for free. Mock the routes you're building, proxy the rest to a real backend. Record network traffic from a Chrome extension and map it to local files.

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

mockr({
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
```

## How it works

Every endpoint is defined by a single `data` field. Its shape decides behavior:

- **`data: T[]`** (array) → **list endpoint** with full CRUD — GET/POST/PUT/PATCH/DELETE out of the box. Mutations persist in memory across requests.
- **`data: T`** (object) → **record endpoint** — a single mutable object. GET returns it; PATCH merges into it; PUT replaces it.

For custom status codes, headers, or hand-rolled logic, use `handler({...})` instead. The old `body` and `response` shorthand fields are removed in v0.3.0; `body` is now reserved for the request side (`req.body`, `handler({ body: zodSchema })`).

```ts
endpoints: [
  { url: '/api/todos',  data: [{ id: 1, title: 'Buy milk', done: false }] }, // list
  { url: '/api/config', data: { theme: 'dark', lang: 'en' } },                // record
  {
    url: '/api/health',
    handler: handler({ fn: () => ({ status: 200, body: { ok: true } }) }),
  },
]
```

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
  '/internal/orders': Order[];
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

Keep your mock data in JSON files instead of inlining it. `dataFile` auto-detects the shape:

- **Array JSON** → data endpoint with full CRUD
- **Object JSON** → static endpoint (read-only)

```ts
const server = await mockr({
  port: 4000,
  endpoints: [
    { url: '/api/todos', dataFile: './todos.json' },    // [{id:1}...] → CRUD
    { url: '/api/config', dataFile: './config.json' },   // {...} → static
  ],
});
```

#### Typed `dataFile`

A plain `dataFile: './x.json'` works but produces an untyped handle (`unknown`).
Wrap the path with `file<T>(...)` to carry the JSON shape into the handle's type
without committing to a static `import` (so JSON edits keep hot-reloading):

```ts
import { mockr, file } from 'mockr';

interface Todo { id: number; title: string; done: boolean }
interface Config { theme: string; lang: string }

type Endpoints = {
  '/api/todos': Todo[];
  '/api/config': Config;
};

const server = await mockr<Endpoints>({
  endpoints: [
    { url: '/api/todos',  dataFile: file<Todo[]>('./todos.json') },   // ListHandle<Todo>
    { url: '/api/config', dataFile: file<Config>('./config.json') }, // RecordHandle<Config>
  ],
});

server.endpoint('/api/todos').findById(1); // Todo | undefined
server.endpoint('/api/config').data.theme; // string
```

`file<T>()` returns a branded `FileRef<T>` whose runtime value is just the path —
hot-reload from disk still happens on every request.

### URL matching

```ts
endpoints: [
  { url: '/api/items/:id', handler: ... },           // named param
  { url: '/api/projects/*/activities', handler: ... }, // * = any one segment
  { url: '/api/**', handler: ... },                    // ** = catch-all
  { url: /^\/v\d+\//, handler: ... },                  // regex
]
```

### Splitting mocks across files

As your mocks grow, split them into typed groups using `endpoints<T>()`. Each group declares its own `Endpoints` slice; the top-level config composes them with intersection.

```ts
// src/mocks/cart.ts
import { endpoints, handler } from 'mockr';
import { z } from 'zod';

interface CartItem { id: number; product_id: number; quantity: number }

export type CartEndpoints = {
  '/internal/cart': CartItem[];
};

export const cartMocks = endpoints<CartEndpoints>([
  { url: '/internal/cart', data: [] },
  {
    url: '/api/cart',
    method: 'POST',
    handler: handler({
      body: z.object({ product_id: z.number(), quantity: z.number() }),
      fn: (req, ctx) => {
        ctx.endpoint('/internal/cart').insert({
          product_id: req.body.product_id,
          quantity: req.body.quantity,
        } as CartItem);
        return { body: { ok: true } };
      },
    }),
  },
]);
```

```ts
// src/mocks/orders.ts
export type OrderEndpoints = {
  '/internal/orders': Order[];
};

export const orderMocks = endpoints<OrderEndpoints>([ /* ... */ ]);
```

```ts
// src/server.ts
import { mockr } from 'mockr';
import { cartMocks,  type CartEndpoints  } from './mocks/cart.js';
import { orderMocks, type OrderEndpoints } from './mocks/orders.js';

type Endpoints = CartEndpoints & OrderEndpoints;

await mockr<Endpoints>({
  port: 4000,
  endpoints: [...cartMocks, ...orderMocks],
});
```

`endpoints<T>()` is a runtime no-op — it only enforces shape per group at the type level. Top-level `mockr<E>()` keeps its explicit generic; groups don't replace it, they compose into it.

---

## Chrome Extension — Record & Map

Record network traffic from your app and map API responses to local files — no manual endpoint setup needed.

### Install

```bash
cd chrome-extension
npm install && npm run build
```

Load as unpacked extension from `chrome://extensions` (Developer mode → Load unpacked → select `chrome-extension/`).

### Usage

1. Open your app, then open DevTools → **mockr** panel
2. XHR requests are recorded automatically
3. Select entries (checkboxes or "Select All API")
4. Click **Map to mockr**

This:
- Writes JSON files to your `mocks/` directory
- Generates `.d.ts` type files
- Adds `dataFile` entries to your server file
- Updates your `Endpoints` type with generated types
- Creates live endpoints immediately (no restart needed)

### Server config for recording

```ts
const server = await mockr<Endpoints>({
  port: 4000,
  recorder: {
    mocksDir: './mocks',              // writes JSON files here
    serverFile: './src/server.ts',    // patches endpoints, types, and imports
  },
  proxy: { target: 'https://api.example.com' },
  endpoints: [
    // mapped endpoints get added here automatically
  ],
});
```

### Mocked tab

The **Mocked** tab in the extension shows all endpoints with:
- **Enable/disable** toggle
- **Editable URL** — change `/api/projects/abc123/items` to `/api/projects/*/items`
- **Type selector** — switch between static, handler, and data
- **Delete** button

---

## CLI options

Override config values from the command line:

```bash
npx tsx mock.ts --port 3000
npx tsx mock.ts --proxy https://api.example.com
npx tsx mock.ts --recorder
npx tsx mock.ts --help
```

| Flag | Description |
|---|---|
| `--port <number>` | Port to listen on (overrides config) |
| `--proxy <url>` | Proxy unmatched requests to this URL |
| `--recorder` | Enable the recorder |
| `--tui` | Enable the terminal UI |
| `--help`, `-h` | Show help message |

---

## Endpoints type system

The `Endpoints` generic maps URLs to their response type:

```ts
type Endpoints = {
  '/api/items': Item[];           // array → list endpoint, handle.data is Item[]
  '/api/config': AppConfig;       // object → record endpoint, handle.data is AppConfig
};

const server = await mockr<Endpoints>({ ... });

const items = server.endpoint('/api/items');
items.data;           // Item[]
items.findById(1);    // Item | undefined (ElementOf<Item[]>)
items.insert({...});  // Item

const config = server.endpoint('/api/config');
config.data;          // AppConfig
config.set({ ... });  // shallow merge
config.replace({ ... }); // full overwrite
```

## API reference

### `EndpointHandle<T>`

`EndpointHandle<T>` is a conditional type:

- `T extends T'[]` → `ListHandle<T'>`
- `T extends object` → `RecordHandle<T>`

#### `ListHandle<U>` — list endpoints (`data: T[]`)

| Method | Return type | Description |
|---|---|---|
| `data` | `U[]` | Live, mutable backing array |
| `findById(id)` | `U \| undefined` | Find item by id |
| `where(filter)` | `U[]` | Filter by object match or predicate |
| `first()` | `U \| undefined` | First item |
| `count()` | `number` | Number of items |
| `has(id)` | `boolean` | Check if id exists |
| `insert(item)` | `U` | Add item (returns with generated id) |
| `update(id, patch)` | `U \| undefined` | Partial update |
| `updateMany(ids, patch)` | `U[]` | Update multiple items |
| `patch(id, fields, defaults?)` | `U \| undefined` | Apply non-undefined fields + defaults |
| `remove(id)` | `boolean` | Delete by id |
| `clear()` | `void` | Remove all items |
| `reset()` | `void` | Restore original data |
| `save(path)` | `Promise<void>` | Save to file |

#### `RecordHandle<T>` — record endpoints (`data: T`)

| Method | Description |
|---|---|
| `data` | Current object (read-only getter) |
| `set(patch)` | Shallow merge `patch` into the current object |
| `replace(value)` | Overwrite the entire object |
| `reset()` | Restore the initial object via deep copy |

### `MockrServer`

| Method | Description |
|---|---|
| `endpoint(url)` | Get typed `EndpointHandle` for a URL |
| `listEndpoints()` | List all endpoints with type, method, enabled status |
| `enableEndpoint(url)` / `disableEndpoint(url)` | Toggle endpoints |
| `enableAll()` / `disableAll()` | Bulk toggle |
| `use(middleware)` | Add middleware at runtime |
| `scenario(name)` | Apply a named scenario |
| `reset()` | Reset all endpoints to initial state |
| `save(path)` | Save snapshot to file |
| `close()` | Shut down server |
| `setPort(port)` | Change listening port |
| `enableProxy()` / `disableProxy()` | Toggle proxy |
| `setProxyTarget(url)` | Change proxy target |
| `tui()` | Launch terminal UI |
| `recorder` | Recorder API (if enabled) |

See [`examples/`](./examples) for more usage patterns.

## License

MIT

