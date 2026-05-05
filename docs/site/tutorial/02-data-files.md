# 02 — Data files

Move state out of the server file into JSON. Edit the JSON; the endpoint reloads in place.

::: tip Run this chapter in 30 seconds
1. **[Open in StackBlitz →](https://stackblitz.com/github/yoyo-67/mockr?file=examples/02-data-files/server.ts)** — full Node sandbox in your browser, no install.
2. Wait for `npm install` to finish, then in the Terminal tab run:
   ```
   npx tsx examples/02-data-files/server.ts
   ```
3. Paste any request from the *Try it* section below into the Terminal (use `curl` — the StackBlitz preview port is forwarded).
:::

## Concept

`dataFile` reads a JSON file at boot and on disk change (debounced 100 ms). Shape decides behavior:

- **Array JSON** → list endpoint, full CRUD.
- **Object JSON** → record endpoint, GET / PATCH / PUT.

Wrap the path with `file<T>('./x.json')` to carry the JSON shape into the handle's type without committing to a static `import` (so JSON edits keep hot-reloading).

## Code

```ts
import { mockr, file } from '@yoyo-org/mockr';

interface Product { id: number; name: string; price: number; stock: number }
interface AppConfig { feature_dark_mode: boolean; max_upload_mb: number }

type Endpoints = {
  '/api/products': Product[];
  '/api/config': AppConfig;
};

mockr<Endpoints>({
  port: 3002,
  endpoints: [
    { url: '/api/products', dataFile: file<Product[]>('./products.json') },
    { url: '/api/config',   dataFile: file<AppConfig>('./config.json') },
  ],
});
```

## Hot-reload semantics

Editing the file resets the endpoint: in-memory mutations (POSTs since the last reload) are dropped; the file content becomes the new state. Last-known-good is kept across bad JSON, so a typo doesn't crash the server.

## Try it

[**Open in StackBlitz →**](https://stackblitz.com/github/yoyo-67/mockr?file=examples/02-data-files/server.ts) — paste each `curl` into the StackBlitz Terminal once `npx tsx examples/02-data-files/server.ts` is running.

```bash
# list (loaded from products.json)
curl -s http://localhost:3002/api/products

# insert — persists in memory, dropped on next file edit
curl -s -X POST http://localhost:3002/api/products \
  -H 'Content-Type: application/json' \
  -d '{"name":"Webcam","price":60,"stock":12}'

# record endpoint, shallow merge
curl -s -X PATCH http://localhost:3002/api/config \
  -H 'Content-Type: application/json' \
  -d '{"max_upload_mb":100}'
```

Now save `products.json` with one item removed — `GET /api/products` reflects it on the next request.

## What's next

Join data across endpoints inside a handler → [03 — Cross-endpoint](./03-cross-endpoint).
