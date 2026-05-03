# 01 — Data list

`data: T[]` turns into a list endpoint with full CRUD. No glue code.

::: tip Run this chapter in 30 seconds
1. **[Open in StackBlitz →](https://stackblitz.com/github/yoyo-67/mockr?file=examples/01-data-list/server.ts)** — full Node sandbox in your browser, no install.
2. Wait for `npm install` to finish, then in the Terminal tab run:
   ```
   npx tsx examples/01-data-list/server.ts
   ```
3. Paste any request from the *Try it* section below into the Terminal (use `curl` — the StackBlitz preview port is forwarded).
:::

## Concept

Define an array of items. `mockr` registers GET / POST / PUT / PATCH / DELETE on the URL. Mutations persist in memory across requests.

## Code

```ts
import { mockr } from '@yoyo-org/mockr';

interface Todo {
  id: number;
  title: string;
  done: boolean;
}

type Endpoints = {
  '/api/todos': Todo[];
};

mockr<Endpoints>({
  port: 3001,
  endpoints: [
    {
      url: '/api/todos',
      data: [
        { id: 1, title: 'Buy milk', done: false },
        { id: 2, title: 'Write tests', done: true },
        { id: 3, title: 'Deploy to prod', done: false },
      ],
    },
  ],
});
```

## Try it

```http
GET    http://localhost:3001/api/todos
POST   http://localhost:3001/api/todos          { "title": "New", "done": false }
PATCH  http://localhost:3001/api/todos/1        { "done": true }
DELETE http://localhost:3001/api/todos/1
```

`POST` returns the inserted item with a generated `id`. `PATCH` returns the merged item. `DELETE` returns `204`.

## What's next

Move data into a JSON file with hot-reload → [02 — Data files](./02-data-files).
