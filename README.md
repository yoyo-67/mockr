# mockr

[![npm](https://img.shields.io/npm/v/@yoyo-org/mockr)](https://www.npmjs.com/package/@yoyo-org/mockr)

Mock API server for frontend prototyping. Declare a typed `mockGroup()` builder — it infers each handler's body, `req.params`, and `ctx` from one endpoint map — seed an in-memory store for full CRUD, and compose groups across files. Mock the routes you're building, proxy the rest to a real backend with `ctx.forward()`, or `hydrate()` a store from the real backend once and mutate it locally. zod `body`/`query` validation, per-endpoint scenarios, WebSocket endpoints, and a Chrome extension that records traffic and maps it to local files.

**Docs: <https://yoyo-67.github.io/mockr/>**

## Install

```bash
npm install @yoyo-org/mockr zod
```

Add `"type": "module"` to `package.json`. Run with `npx tsx mock.ts` — no build step.

## Quick example

```ts
import { mockr, mockGroup } from '@yoyo-org/mockr';
import { z } from 'zod';

type Todo = { id: number; title: string; done: boolean };
type Endpoints = {
  '/api/todos': Todo[];
  '/api/todos/:id': Todo;
};

const todos = mockGroup<Endpoints>()
  .data('/api/todos', [{ id: 1, title: 'Buy milk', done: false }])
  .post('/api/todos', {
    body: z.object({ title: z.string() }),
    fn: (req, ctx) => {
      ctx.endpoint('/api/todos').insert({ id: Date.now(), title: req.body.title, done: false });
      return ctx.endpoint('/api/todos').data;
    },
  })
  .patch('/api/todos/:id', {
    body: z.object({ done: z.boolean() }),
    fn: (req, ctx) => ctx.endpoint('/api/todos').update(Number(req.params.id), req.body),
  })
  .done();

await mockr({ port: 4000, groups: [todos] });
```

`GET /api/todos` returns the array, `POST` inserts, `PATCH` updates, `DELETE` removes — no glue code.

The old `handler()` / `endpoints()` functions are deprecated in favor of `mockGroup()` — see [MIGRATION.md](./MIGRATION.md).

## Where to next

- [Concepts](https://yoyo-67.github.io/mockr/concepts) — the data-driven mental model
- [Tutorial](https://yoyo-67.github.io/mockr/tutorial/) — eleven chapters, each a runnable example
- [Reference](https://yoyo-67.github.io/mockr/reference/) — full API surface (handlers, WebSocket, recorder, CLI)
- [Examples](./examples) — copy-pasteable working servers

## License

MIT
