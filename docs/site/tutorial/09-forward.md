# 09 — `ctx.forward()`

Sits between a synthetic handler and pure proxy (passthrough): forward the current request to the configured upstream, mutate the response, return it.

::: tip Run this chapter in 30 seconds
1. **[Open in StackBlitz →](https://stackblitz.com/github/yoyo-67/mockr?file=examples/09-forward/server.ts)** — full Node sandbox in your browser, no install.
2. Wait for `npm install` to finish, then in the Terminal tab run:
   ```
   npx tsx examples/09-forward/server.ts
   ```
3. Paste any request from the *Try it* section below into the Terminal (use `curl` — the StackBlitz preview port is forwarded).
:::

## Concept

Inside a handler, `await ctx.forward()` hits `proxy.target + req.path`, returns `{ status, body, headers }`. JSON bodies are parsed and mutable. Mutate freely and return — the same object goes to the client.

Optional patch overrides any field:

```ts
await ctx.forward({ path: '/v2/users' });          // different upstream path
await ctx.forward({ method: 'PUT', body });        // change verb + body
await ctx.forward({ headers: rest });              // strip auth, add tracing
```

Throws if `proxy.target` is not configured.

## Three patterns

```ts
import { mockr, mockGroup } from '@yoyo-org/mockr';

interface Post { id: number; title: string; body: string }
interface Todo { id: number; completed: boolean; title: string }

type Endpoints = {
  '/posts': Post[];
  '/todos/:id': Todo & { _localTag: string };
  '/users/:id': { id: string; stubbed: boolean };
};

const api = mockGroup<Endpoints>()
  // 1. Filter a list — drop items from upstream.
  .get('/posts', async (_req, ctx) => {
    const res = await ctx.forward<Post[]>();
    res.body = res.body.filter((p) => p.title.length > 40);
    return res;
  })

  // 2. Enrich a record — attach a derived field.
  .get('/todos/:id', async (_req, ctx) => {
    const res = await ctx.forward();
    (res.body as Todo & { _localTag: string })._localTag = 'enriched-locally';
    return res;
  })

  // 3. Conditional forward — synthetic stub for one query flag, live otherwise.
  .get('/users/:id', async (req, ctx) => {
    if (req.query.stub) {
      return { id: req.params.id, stubbed: true };
    }
    return ctx.forward();
  })
  .done();

mockr({
  port: 3009,
  proxy: { target: 'https://jsonplaceholder.typicode.com' },
  groups: [api],
});
```

## Try it

[**Open in StackBlitz →**](https://stackblitz.com/github/yoyo-67/mockr?file=examples/09-forward/server.ts) — paste each `curl` into the StackBlitz Terminal once `npx tsx examples/09-forward/server.ts` is running.

```bash
# pattern 1 — forwarded list, mockr filtered short titles out
curl -s http://localhost:3009/posts | head -c 200

# pattern 2 — forwarded record, _localTag stitched in
curl -s http://localhost:3009/todos/1

# pattern 3 — synthetic stub via query flag
curl -s 'http://localhost:3009/users/1?stub=1'

# same route without flag — live forward
curl -s http://localhost:3009/users/1
```

## Console tag

Forwarded requests log with a third tag (`mock` / `->` / `fwd`):

```
  fwd   GET    200 /posts          124ms
  fwd   GET    200 /todos/1        87ms
  mock  GET    200 /users/1?stub=1 1ms
```

## Mem-session friendly

`ctx.forward()` participates in mem-sessions: GET/HEAD upstream responses cache during `record`, replay serves from cache without hitting upstream. Handler mutation always re-runs on a clone of the cached body — cache stays clean across iterations.

## What's next

See everything composed in one file → [10 — Everything](./10-everything).
