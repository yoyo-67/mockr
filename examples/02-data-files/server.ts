// Feature: dataFile + file<T>().
//
// Load endpoint state from JSON files on disk. Edit the JSON, the endpoint
// hot-reloads in-place. `file<T>()` carries the JSON shape into the handle's
// type without a static `import`.
//
// Array JSON  → list endpoint, full CRUD on disk-backed data.
// Object JSON → record endpoint, GET/PATCH/PUT against a single object.

import { mockr, file } from '../../src/index.js';

interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  stock: number;
}

interface AppConfig {
  feature_dark_mode: boolean;
  max_upload_mb: number;
  supported_locales: string[];
}

type Endpoints = {
  '/api/products': Product[];
  '/api/config': AppConfig;
};

const server = await mockr<Endpoints>({
  port: 3002,
  endpoints: [
    // Array JSON → list endpoint.
    {
      url: '/api/products',
      dataFile: file<Product[]>(new URL('./products.json', import.meta.url).pathname),
    },

    // Object JSON → record endpoint.
    {
      url: '/api/config',
      dataFile: file<AppConfig>(new URL('./config.json', import.meta.url).pathname),
    },
  ],
});

console.log(`Data-files example running at ${server.url}`);
console.log(`  GET    /api/products       (list, full CRUD)`);
console.log(`  GET    /api/config         (record, set/replace via PATCH/PUT)`);
console.log(`  Edit ./products.json or ./config.json — endpoint hot-reloads.`);
