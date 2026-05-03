// Feature: middleware (logger, delay, auth, custom).
//
// Middleware runs around every request. `pre` can short-circuit; `post`
// can rewrite the response. Built-ins ship in the package; custom ones
// are plain `{ pre, post }` objects.

import { mockr, handler, auth, delay, logger } from '../../src/index.js';

mockr({
  port: 3005,
  middleware: [
    logger(),                              // logs every request
    delay({ min: 50, max: 150 }),          // simulate latency
    auth({                                 // bearer-token guard
      type: 'bearer',
      validate: (token) => token === 'admin-token-123',
      exclude: ['/api/health', '/api/login'],
    }),
    {                                      // custom: tag every response
      name: 'request-id',
      post: (_req, res) => ({
        ...res,
        headers: { ...res.headers, 'x-request-id': `req-${Date.now()}` },
      }),
    },
  ],
  endpoints: [
    { url: '/api/health', data: { status: 'ok' } },
    {
      url: '/api/login',
      method: 'POST',
      handler: handler({
        fn: (req) => {
          const { email } = req.body as { email: string };
          if (email === 'admin@example.com') {
            return { body: { token: 'admin-token-123' } };
          }
          return { status: 401, body: { error: 'Invalid credentials' } };
        },
      }),
    },
    { url: '/api/secret', data: { flag: 42 } },
  ],
});

console.log(`Middleware example running at http://localhost:3005`);
console.log(`  GET    /api/health    (no auth — excluded)`);
console.log(`  POST   /api/login     (no auth — issues a token)`);
console.log(`  GET    /api/secret    (auth required — Bearer admin-token-123)`);
