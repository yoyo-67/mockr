# Tutorial

Ten short chapters. Each isolates one feature, simplest first. Code in every chapter mirrors a working example in [`examples/`](https://github.com/yoyo-67/mockr/tree/main/examples) — clone the repo or open the chapter live in StackBlitz.

| # | Chapter | Feature |
|---|---|---|
| [01](./01-data-list) | Data list | `data: T[]` → free CRUD |
| [02](./02-data-files) | Data files | `dataFile` + `file<T>` + hot-reload |
| [03](./03-cross-endpoint) | Cross-endpoint | `ctx.endpoint(url)` joins |
| [04](./04-handlers-zod) | Handlers + zod | `handler({ body, query, params, fn })` |
| [05](./05-middleware) | Middleware | `logger` / `delay` / `auth` + `server.use()` |
| [06](./06-scenarios) | Scenarios | named server states |
| [07](./07-multi-method) | Multi-method | `methods: { GET, POST, ... }` |
| [08](./08-proxy) | Proxy | passthrough to upstream |
| [09](./09-forward) | `ctx.forward()` | forward + mutate |
| [10](./10-everything) | Everything | composed showcase |

## Setup once

```bash
npm install @yoyo-org/mockr zod
```

Add `"type": "module"` to `package.json`. Run any chapter's server with:

```bash
npx tsx server.ts
```

For dev work use `tsx watch` — saves to the server file or imported mock groups respawn the process.

## Read the chapters in order

Each chapter is self-contained but builds on vocabulary from the prior one. Skim 01–03 to absorb the data model; jump to whichever later chapter matches the feature you need.
