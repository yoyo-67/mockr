# 10 — Everything

Kitchen-sink showcase: `dataFile` + cross-endpoint joins + URL params + middleware (`logger` / `delay` / `errorInjection` / custom `post`) + scenarios — composed in one server.

[Open in StackBlitz →](https://stackblitz.com/github/yoyo-67/mockr/tree/experiments/examples/10-everything?file=server.ts)

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

## Where next

- README in the repo for the full API reference.
- `examples/` for any feature you want to copy in isolation.
- Issue tracker for bug reports / feature requests.
