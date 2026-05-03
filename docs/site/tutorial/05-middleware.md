# 05 — Middleware

`{ pre, post }` wrappers run around every request. `pre` can short-circuit; `post` can rewrite the response. Built-ins ship in the package.

[Open in StackBlitz →](https://stackblitz.com/github/yoyo-67/mockr/tree/experiments/examples/05-middleware?file=server.ts)

## Concept

Middleware order matters — top of the array runs first. A `pre` that returns a `HandlerResult` skips downstream handlers entirely. `server.use(...)` adds middleware after boot (e.g., admin guards toggled at runtime).

## Code

```ts
import { mockr, handler, auth, delay, logger } from '@yoyo-org/mockr';

const server = await mockr({
  port: 3005,
  middleware: [
    logger(),
    delay({ min: 50, max: 150 }),
    auth({
      type: 'bearer',
      validate: (token) => token === 'admin-token-123',
      exclude: ['/api/health', '/api/login'],
    }),
  ],
  endpoints: [
    { url: '/api/health', data: { status: 'ok' } },
    {
      url: '/api/login',
      method: 'POST',
      handler: handler({
        fn: (req) => {
          const { email } = req.body as { email: string };
          if (email === 'admin@example.com') return { body: { token: 'admin-token-123' } };
          return { status: 401, body: { error: 'Invalid credentials' } };
        },
      }),
    },
    { url: '/api/secret', data: { flag: 42 } },
  ],
});

server.use({
  name: 'request-id',
  post: (_req, res) => ({
    ...res,
    headers: { ...res.headers, 'x-request-id': `req-${Date.now()}` },
  }),
});
```

## Built-in middleware

| Helper | Purpose |
|---|---|
| `logger()` | Logs each request to stdout. |
| `delay({ min, max })` | Random latency between bounds. |
| `auth({ type, validate, exclude })` | Bearer / Basic guard. |
| `errorInjection({ rate, status })` | Random N% failure for retry-logic testing. |

## Try it

```http
GET  http://localhost:3005/api/health                                # 200, no auth
POST http://localhost:3005/api/login    { "email": "admin@example.com" }
GET  http://localhost:3005/api/secret   Authorization: Bearer admin-token-123
GET  http://localhost:3005/api/secret                                # 401
```

## What's next

Switch the server between named states → [06 — Scenarios](./06-scenarios).
