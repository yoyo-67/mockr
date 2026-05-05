# 08 — Proxy passthrough

Mock the routes you're building; forward everything else verbatim to a real backend.

::: tip Run this chapter in 30 seconds
1. **[Open in StackBlitz →](https://stackblitz.com/github/yoyo-67/mockr?file=examples/08-proxy/server.ts)** — full Node sandbox in your browser, no install.
2. Wait for `npm install` to finish, then in the Terminal tab run:
   ```
   npx tsx examples/08-proxy/server.ts
   ```
3. Paste any request from the *Try it* section below into the Terminal (use `curl` — the StackBlitz preview port is forwarded).
:::

## Concept

`proxy.target` is the upstream URL. When a request doesn't match any endpoint (or the matching endpoint is disabled), mockr forwards it: same method, path, query, body, and headers. Cookies on the response have `Domain=` and `Secure` stripped so they stick on `localhost`.

Toggle at runtime: `server.enableProxy()` / `disableProxy()` / `setProxyTarget(url)`.

## Code

```ts
import { mockr, handler } from '@yoyo-org/mockr';

const TARGET = process.env.PROXY_TARGET || 'https://jsonplaceholder.typicode.com';

mockr({
  port: 3008,
  proxy: { target: TARGET },
  endpoints: [
    // mock the routes you're working on
    { url: '/api/feature-flags', data: { darkMode: true, betaSearch: true } },
    {
      url: '/api/users/me',
      handler: handler({
        fn: () => ({ body: { id: 42, name: 'Dev User', role: 'admin' } }),
      }),
    },
  ],
});
```

## Try it

[**Open in StackBlitz →**](https://stackblitz.com/github/yoyo-67/mockr?file=examples/08-proxy/server.ts) — paste each `curl` into the StackBlitz Terminal once `npx tsx examples/08-proxy/server.ts` is running.

```bash
# mocked
curl -s http://localhost:3008/api/feature-flags
curl -s http://localhost:3008/api/users/me

# proxied — passthrough to jsonplaceholder
curl -s http://localhost:3008/posts/1
curl -s 'http://localhost:3008/posts?userId=1'
```

The console tags each line:

```
  mock  GET    200 /api/feature-flags  3ms
  mock  GET    200 /api/users/me       1ms
   ->   GET    200 /posts/1            142ms
```

## What's next

Forward inside a handler and mutate the response before returning → [09 — `ctx.forward()`](./09-forward).
