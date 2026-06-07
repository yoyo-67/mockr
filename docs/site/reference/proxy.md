# Proxy & `ctx.forward()` reference

## Proxy passthrough

Unmatched routes forward to `proxy.target`:

```ts
const orders = mockGroup<Endpoints>()
  .data('/api/orders', [/* ... */])   // mocked
  .done();

await mockr({
  port: 4000,
  proxy: { target: 'https://api.example.com' },
  groups: [orders],
  // everything else → api.example.com
});
```

| Option | Description |
|---|---|
| `proxy.target` | Upstream base URL. Required for `ctx.forward()`. |
| `proxy.targets` | Per-prefix overrides — route some paths to other upstreams. |
| `proxy.changeOrigin` | Rewrite `Host` header to match `target` (default `true`). |
| `proxy.headers` | Static headers to inject on every forwarded request. |
| `proxy.timeoutMs` | Request timeout (default `30000`). |

Proxying drops hop-by-hop headers (`connection`, `keep-alive`, `transfer-encoding`, etc.) per RFC 7230.

## `server.enableProxy()` / `setProxyTarget()`

Toggle and retarget at runtime — useful when switching between dev and staging during a session.

## `ctx.forward()` — forward then mutate

Inside a handler, `ctx.forward()` hits upstream and resolves with the response. You can return it as-is or mutate first.

```ts
mockGroup<Endpoints>()
  .get('/api/orders', async (_req, ctx) => {
    const upstream = await ctx.forward();
    // upstream: { status, headers, body }

    // tag every order with `_mocked: true` for client-side detection
    if (Array.isArray(upstream.body)) {
      upstream.body = upstream.body.map((o) => ({ ...o, _mocked: true }));
    }
    return upstream;
  })
  .done();
```

### Override request

`ctx.forward({ url, method, headers, body })` lets you forward to a different upstream URL or rewrite the request before sending.

```ts
const upstream = await ctx.forward({
  url: '/v2/orders',                  // hit a different path on `proxy.target`
  headers: { 'X-Forwarded-By': 'mockr' },
});
```

## `.data(url, loader)` — forward once, then own

Pass a **function** to `.data` to seed the store from upstream **once**, then serve and mutate it locally. Unlike a bare `ctx.forward()` (which re-runs every request), a loader-backed store is fetched a single time on first read — after that, local CRUD mutations stick.

```ts
const api = mockGroup<{ '/api/todos': Todo[] }>()
  .data('/api/todos', (_req, ctx) => ctx.forward<Todo[]>().then((r) => r.body))
  .done();

await mockr({ proxy: { target: 'https://api.example.com' }, groups: [api] });
// GET fills from upstream once; POST/PUT/PATCH/DELETE mutate the owned copy.
```

`server.endpoint(url).reset()` re-arms it (next read re-loads). A param'd URL keeps one owned store per resolved param-set. See the [builder reference](/reference/builder#loaders-partitions) for the full behavior.

## When to use which

| Goal | Tool |
|---|---|
| All unmatched routes → upstream | `proxy: { target }` |
| Mock some routes, proxy the rest | `proxy: { target }` + matching `groups` |
| Mock + augment one route (every request) | a `.get()` handler that returns `ctx.forward()` |
| Fetch real data once, then edit it locally | `.data(url, loader)` (function seed) |
| Record traffic to map → mocks | `recorder` + Chrome extension |
