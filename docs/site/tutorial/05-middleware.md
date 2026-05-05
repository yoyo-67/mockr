# 05 — Middleware

`{ pre, post }` wrappers run around every request. `pre` can short-circuit; `post` can rewrite the response. Built-ins ship in the package.

::: tip Run this chapter in 30 seconds
1. **[Open in StackBlitz →](https://stackblitz.com/github/yoyo-67/mockr?file=examples/05-middleware/server.ts)** — full Node sandbox in your browser, no install.
2. Wait for `npm install` to finish, then in the Terminal tab run:
   ```
   npx tsx examples/05-middleware/server.ts
   ```
3. Paste any request from the *Try it* section below into the Terminal (use `curl` — the StackBlitz preview port is forwarded).
:::

## Concept

Middleware order matters — top of the array runs first. A `pre` that returns a `HandlerResult` skips downstream handlers entirely. `server.use(...)` adds middleware after boot (e.g., admin guards toggled at runtime).

## Code

```ts
import { mockr, handler, auth, delay, logger } from '@yoyo-org/mockr';

mockr({
  port: 3005,
  middleware: [
    logger(),
    delay({ min: 50, max: 150 }),
    auth({
      type: 'bearer',
      validate: (token) => token === 'admin-token-123',
      exclude: ['/api/health', '/api/login'],
    }),
    {
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
          if (email === 'admin@example.com') return { body: { token: 'admin-token-123' } };
          return { status: 401, body: { error: 'Invalid credentials' } };
        },
      }),
    },
    { url: '/api/secret', data: { flag: 42 } },
  ],
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

[**Open in StackBlitz →**](https://stackblitz.com/github/yoyo-67/mockr?file=examples/05-middleware/server.ts) — paste each `curl` into the StackBlitz Terminal once `npx tsx examples/05-middleware/server.ts` is running.

```bash
# excluded from auth — 200
curl -s http://localhost:3005/api/health

# get a token
curl -s -X POST http://localhost:3005/api/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com"}'

# authed — 200, plus x-request-id header
curl -s http://localhost:3005/api/secret \
  -H 'Authorization: Bearer admin-token-123' -i

# no token — 401
curl -s http://localhost:3005/api/secret -i
```

## What's next

Switch the server between named states → [06 — Scenarios](./06-scenarios).
