// Feature: ctx.forward().
//
// Forward the current request to `proxy.target`, then mutate the upstream
// response before returning to the client. Three patterns shown:
//   1. Filter a list — drop items from upstream.
//   2. Enrich a record — add fields to upstream.
//   3. Conditional forward — synthetic stub for one query flag, live otherwise.

import { mockr, handler } from '../../src/index.js';

const TARGET = process.env.PROXY_TARGET || 'https://jsonplaceholder.typicode.com';

interface Post {
  userId: number;
  id: number;
  title: string;
  body: string;
}

interface Todo {
  userId: number;
  id: number;
  title: string;
  completed: boolean;
}

type Endpoints = {
  '/posts': Post[];
  '/todos/:id': Todo;
};

const server = await mockr<Endpoints>({
  port: 3009,
  proxy: { target: TARGET },
  endpoints: [
    // Filter list: forward to upstream, drop posts whose title is too short.
    {
      url: '/posts',
      handler: handler({
        fn: async (_req, ctx) => {
          const res = await ctx.forward<Post[]>();
          res.body = res.body.filter((p) => p.title.length > 40);
          return res;
        },
      }),
    },

    // Enrich a single record: forward, then attach a derived field.
    {
      url: '/todos/:id',
      handler: handler({
        fn: async (_req, ctx) => {
          const res = await ctx.forward();
          (res.body as Todo & { _localTag: string })._localTag = 'enriched-locally';
          return res;
        },
      }),
    },

    // Conditional forward: query flag returns synthetic stub, otherwise live.
    {
      url: '/users/:id',
      handler: handler({
        fn: async (req, ctx) => {
          if (req.query.stub) {
            return { status: 200, body: { id: req.params.id, stubbed: true } };
          }
          const res = await ctx.forward();
          return res;
        },
      }),
    },
  ],
});

console.log(`Forward example running at ${server.url}`);
console.log(`  Filtered: GET /posts             (drops short titles from upstream)`);
console.log(`  Enriched: GET /todos/1           (adds _localTag to upstream record)`);
console.log(`  Stubbed:  GET /users/1?stub=1    (synthetic; ?stub omitted = live)`);
console.log(`  Upstream: ${TARGET}`);

