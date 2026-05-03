// Feature: proxy.target — passthrough for unmatched routes.
//
// Define mock endpoints for the routes you're working on; everything else
// gets forwarded verbatim to the real backend.

import { mockr, handler } from '../../src/index.js';

const TARGET = process.env.PROXY_TARGET || 'https://jsonplaceholder.typicode.com';

const server = await mockr({
  port: 3008,
  endpoints: [
    {
      url: '/api/feature-flags',
      data: {
        darkMode: true,
        newDashboard: false,
        betaSearch: true,
      },
    },
    {
      url: '/api/users/me',
      handler: handler({ fn: () => ({
        status: 200,
        body: {
          id: 42,
          name: 'Dev User',
          email: 'dev@localhost',
          role: 'admin',
        },
      }) }),
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
