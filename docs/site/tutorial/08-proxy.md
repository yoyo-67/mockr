# 08 — Proxy passthrough

Mock the routes you're building; forward everything else verbatim to a real backend.

[Open in StackBlitz →](https://stackblitz.com/github/yoyo-67/mockr/tree/experiments/examples/08-proxy?file=server.ts)

## Concept

`proxy.target` is the upstream URL. When a request doesn't match any endpoint (or the matching endpoint is disabled), mockr forwards it: same method, path, query, body, and headers. Cookies on the response have `Domain=` and `Secure` stripped so they stick on `localhost`.

Toggle at runtime: `server.enableProxy()` / `disableProxy()` / `setProxyTarget(url)`.

## Code

```ts
import { mockr, handler } from '@yoyo-org/mockr';

const TARGET = process.env.PROXY_TARGET || 'https://jsonplaceholder.typicode.com';

await mockr({
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

```http
GET http://localhost:3008/api/feature-flags    # mocked
GET http://localhost:3008/api/users/me         # mocked
GET http://localhost:3008/posts/1              # proxied → jsonplaceholder
GET http://localhost:3008/posts?userId=1       # proxied with query string
```

The console tags each line:

```
  mock  GET    200 /api/feature-flags  3ms
  mock  GET    200 /api/users/me       1ms
   ->   GET    200 /posts/1            142ms
```

## What's next

Forward inside a handler and mutate the response before returning → [09 — `ctx.forward()`](./09-forward).
