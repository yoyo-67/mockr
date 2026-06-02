---
layout: home

hero:
  name: mockr
  text: Mock API server for frontend prototyping
  tagline: Define endpoints, get full CRUD for free. Mock the routes you're building, proxy the rest to a real backend. Record traffic from the Chrome extension and map it to local files.
  actions:
    - theme: brand
      text: Start the tutorial
      link: /tutorial/
    - theme: alt
      text: GitHub
      link: https://github.com/yoyo-67/mockr

features:
  - icon: 🪄
    title: Free CRUD from data
    details: |
      `data: T[]` becomes a list endpoint with GET/POST/PUT/PATCH/DELETE.
      `data: T` becomes a record endpoint. Mutations persist in memory.
  - icon: 📁
    title: Hot-reloadable JSON files
    details: |
      `dataFile: file<T>('./todos.json')` — edit the file, endpoint reloads.
      Type-safe handles without static imports.
  - icon: 🔌
    title: Proxy + ctx.forward()
    details: |
      Pass-through unmatched routes. Inside a handler, `ctx.forward()`
      hits upstream, returns the response so you can mutate before sending.
  - icon: 🎬
    title: Named scenarios
    details: |
      Switch between server states (`empty` / `crowded` / `down`) for
      demos, e2e tests, and reproducing edge cases.
  - icon: 🛡️
    title: Typed builder + zod
    details: |
      `mockGroup<E>()` infers the response body, path params, and `ctx` from
      the URL. Add zod `body` / `query` / `params` — typed `req`, no casts.
  - icon: 🧩
    title: Chrome extension recorder
    details: |
      Capture network traffic, map responses to local JSON files, generate
      `.d.ts` types. Replay sessions in-memory for offline dev.
  - icon: 🛰️
    title: WebSocket endpoints
    details: |
      `ws({ onConnect, onMessage, onClose })` mocks streaming protocols.
      Cross-endpoint `WsHandle.broadcast` lets HTTP routes push to clients.
---

## Quick start

```bash
npm install @yoyo-org/mockr zod
npx tsx mock.ts
```

```ts
import { mockr, mockGroup } from '@yoyo-org/mockr';

type Endpoints = { '/api/todos': { id: number; title: string; done: boolean }[] };

const todos = mockGroup<Endpoints>()
  .data('/api/todos', [{ id: 1, title: 'Buy milk', done: false }])
  .done();

await mockr({ port: 4000, groups: [todos] });
```

That's it. `GET /api/todos` returns the array. `POST /api/todos` inserts. `PATCH /api/todos/1` updates. `DELETE /api/todos/1` removes. No glue code.

[Continue with the tutorial →](/tutorial/)
