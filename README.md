# mockr

[![npm](https://img.shields.io/npm/v/@yoyo-org/mockr)](https://www.npmjs.com/package/@yoyo-org/mockr)

Mock API server for frontend prototyping. Define endpoints with data, get full CRUD for free. Mock the routes you're building, proxy the rest to a real backend. WebSocket endpoints, scenarios, zod validation, and a Chrome extension that records traffic and maps it to local files.

**Docs: <https://yoyo-67.github.io/mockr/>**

## Install

```bash
npm install @yoyo-org/mockr zod
```

Add `"type": "module"` to `package.json`. Run with `npx tsx mock.ts` — no build step.

## Quick example

```ts
import { mockr } from '@yoyo-org/mockr';

await mockr({
  port: 4000,
  endpoints: [
    { url: '/api/todos', data: [{ id: 1, title: 'Buy milk', done: false }] },
  ],
});
```

`GET /api/todos` returns the array. `POST` inserts. `PATCH /api/todos/1` updates. `DELETE /api/todos/1` removes. No glue code.

## Where to next

- [Concepts](https://yoyo-67.github.io/mockr/concepts) — the data-driven mental model
- [Tutorial](https://yoyo-67.github.io/mockr/tutorial/) — eleven chapters, each a runnable example
- [Reference](https://yoyo-67.github.io/mockr/reference/) — full API surface (handlers, WebSocket, recorder, CLI)
- [Examples](./examples) — copy-pasteable working servers

## License

MIT
