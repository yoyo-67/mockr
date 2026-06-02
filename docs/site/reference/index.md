# Reference

Type surface and API contracts. The [tutorial](/tutorial/) is the place to start; this section is for lookup.

| Page | Covers |
|---|---|
| [Builder](/reference/builder) | `mockGroup<E>()`, verbs, `.data`, `.prefix`, `.done`, direct body, `ctx` shorthands |
| [Endpoints](/reference/endpoints) | `EndpointHandle<T>` (`ListHandle` / `RecordHandle`), `dataFile`, `MockrServer` |
| [Handlers](/reference/handlers) | Verb specs, `req`, `ctx`, `responseSchema`, `scenarios`, `ctx.forward()` |
| [Query params](/reference/query-params) | `jsonParam` / `jsonArrayParam`, `factory` |
| [WebSocket](/reference/websocket) | `ws({...})`, `WsEndpoint`, `WsHandle`, hooks, schemas |
| [Middleware](/reference/middleware) | `logger` / `delay` / `auth` / `errorInjection`, custom `pre` / `post` |
| [Scenarios](/reference/scenarios) | Per-endpoint presets + named server states |
| [Proxy & forward](/reference/proxy) | Pass-through, `ctx.forward()` mutate-then-return |
| [Verify](/reference/verify) | `responseSchema` + `verify` / `--verify` contract-drift checks |
| [Recorder](/reference/recorder) | Chrome extension, `recorder.mocksDir`, server file patching |
| [CLI](/reference/cli) | `--port` / `--proxy` / `--recorder` / `--verify` / `--tui` |
| [Config](/reference/config) | `MockrConfig` shape, `groups`, top-level options |

> `handler()` and `endpoints()` are **deprecated** — use `mockGroup()`. See [MIGRATION.md](https://github.com/yoyo-67/mockr/blob/main/MIGRATION.md).
