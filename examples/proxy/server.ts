// Proxy example: mock some routes, forward everything else to a real backend.
// Usage: npx tsx examples/proxy/server.ts

import { mockr } from '../../src/index.js';

const TARGET = process.env.PROXY_TARGET || 'https://jsonplaceholder.typicode.com';

const server = await mockr({
  port: 3005,
  endpoints: [
    {
      url: '/api/feature-flags',
      body: {
        darkMode: true,
        newDashboard: false,
        betaSearch: true,
      },
    },
    {
      url: '/api/users/me',
      handler: () => ({
        status: 200,
        body: {
          id: 42,
          name: 'Dev User',
          email: 'dev@localhost',
          role: 'admin',
        },
      }),
    },
  ],
  proxy: {
    target: TARGET,
  },
});

console.log(`Proxy example running at ${server.url}`);
console.log(`  Mocked:  GET /api/feature-flags`);
console.log(`  Mocked:  GET /api/users/me`);
console.log(`  Proxied: everything else -> ${TARGET}`);
