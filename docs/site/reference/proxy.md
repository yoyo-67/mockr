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

## When to use which

| Goal | Tool |
|---|---|
| All unmatched routes → upstream | `proxy: { target }` |
| Mock some routes, proxy the rest | `proxy: { target }` + matching `groups` |
| Mock + augment one route | a `.get()` handler that returns `ctx.forward()` |
| Record traffic to map → mocks | `recorder` + Chrome extension |
