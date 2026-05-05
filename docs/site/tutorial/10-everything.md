# 10 — Everything

Kitchen-sink showcase: `dataFile` + cross-endpoint joins + URL params + middleware (`logger` / `delay` / `errorInjection` / custom `post`) + scenarios — composed in one server.

::: tip Run this chapter in 30 seconds
1. **[Open in StackBlitz →](https://stackblitz.com/github/yoyo-67/mockr?file=examples/10-everything/server.ts)** — full Node sandbox in your browser, no install.
2. Wait for `npm install` to finish, then in the Terminal tab run:
   ```
   npx tsx examples/10-everything/server.ts
   ```
3. Paste any request from the *Try it* section below into the Terminal (use `curl` — the StackBlitz preview port is forwarded).
:::

## Why this chapter

Each previous chapter isolates one feature. Real apps stack several. This one shows how they fit together without contention:

| Layer | Provided by |
|---|---|
| Source-of-truth data | `dataFile` (rooms.json, messages.json) |
| Public API | `handler({ fn })` reading `ctx.endpoint('/internal/*')` |
| URL params | `:roomId`, `*` patterns |
| Cross-cutting concerns | `logger` + `delay` + `errorInjection` + custom `post` middleware |
| Variants | scenarios `busy` / `empty` |

## What to read

Don't try to memorize this file. Skim the structure, find the layer you need, copy that snippet into your own server. The chapter exists as a reality check that the pieces compose cleanly — not as a starting template.

## Run it

```bash
git clone https://github.com/yoyo-67/mockr
cd mockr/examples/10-everything
npx tsx server.ts
```

`requests.http` in the same folder lists the operations to try in order.

## Try it

[**Open in StackBlitz →**](https://stackblitz.com/github/yoyo-67/mockr?file=examples/10-everything/server.ts) — paste each `curl` into the StackBlitz Terminal once `npx tsx examples/10-everything/server.ts` is running.

```bash
# list rooms
curl -s http://localhost:3010/api/rooms
curl -s 'http://localhost:3010/api/rooms?private=true'

# messages for a room
curl -s http://localhost:3010/api/rooms/1/messages

# send a message
curl -s -X POST http://localhost:3010/api/rooms/1/messages \
  -H 'Content-Type: application/json' \
  -d '{"author":"alice","text":"hello world"}'

# search across all rooms
curl -s 'http://localhost:3010/api/search?q=hello'

# aggregate stats
curl -s http://localhost:3010/api/stats

# scenarios
curl -s -X POST http://localhost:3010/__mockr/scenario \
  -H 'Content-Type: application/json' \
  -d '{"name":"busy"}'
curl -s http://localhost:3010/api/stats

curl -s -X POST http://localhost:3010/__mockr/scenario \
  -H 'Content-Type: application/json' \
  -d '{"name":"empty"}'
curl -s http://localhost:3010/api/stats
```

About 5% of requests randomly return `500` (errorInjection middleware). Re-run if you hit one — that's the demo.

## Where next

- README in the repo for the full API reference.
- `examples/` for any feature you want to copy in isolation.
- Issue tracker for bug reports / feature requests.
