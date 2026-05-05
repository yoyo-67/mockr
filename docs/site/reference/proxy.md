# Proxy & `ctx.forward()` reference

## Proxy passthrough

Unmatched routes forward to `proxy.target`:

```ts
await mockr({
  port: 4000,
  proxy: { target: 'https://api.example.com' },
  endpoints: [
    { url: '/api/orders', data: [/* ... */] }, // mocked
    // everything else → api.example.com
  ],
});
```

| Option | Description |
|---|---|
| `proxy.target` | Upstream base URL. Required for `ctx.forward()`. |
| `proxy.changeOrigin` | Rewrite `Host` header to match `target` (default `true`). |
| `proxy.headers` | Static headers to inject on every forwarded request. |
| `proxy.timeoutMs` | Request timeout (default `30000`). |

Proxying drops hop-by-hop headers (`connection`, `keep-alive`, `transfer-encoding`, etc.) per RFC 7230.

## `server.enableProxy()` / `setProxyTarget()`

Toggle and retarget at runtime — useful when switching between dev and staging during a session.

## `ctx.forward()` — forward then mutate

Inside a `handler`, `ctx.forward()` hits upstream and resolves with the response. You can return it as-is or mutate first.

```ts
{
  url: '/api/orders',
  handler: handler({
    fn: async (req, ctx) => {
      const upstream = await ctx.forward();
      // upstream: { status, headers, body }

      // tag every order with `_mocked: true` for client-side detection
      if (Array.isArray(upstream.body)) {
        upstream.body = upstream.body.map((o) => ({ ...o, _mocked: true }));
      }
      return upstream;
    },
  }),
}
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
| Mock some routes, proxy the rest | `proxy: { target }` + matching endpoints |
| Mock + augment one route | `handler` + `ctx.forward()` |
| Record traffic to map → mocks | `recorder` + Chrome extension |
