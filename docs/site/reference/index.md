# Reference

Type surface and API contracts. The [tutorial](/tutorial/) is the place to start; this section is for lookup.

| Page | Covers |
|---|---|
| [Endpoints](/reference/endpoints) | `EndpointHandle<T>` (`ListHandle` / `RecordHandle`), `MockrServer` |
| [Handlers](/reference/handlers) | `handler({ body, query, params, fn })`, `ctx`, `ctx.forward()` |
| [WebSocket](/reference/websocket) | `ws({...})`, `WsEndpoint`, `WsHandle`, hooks, schemas |
| [Middleware](/reference/middleware) | `logger` / `delay` / `auth` / `errorInjection`, custom `pre` / `post` |
| [Scenarios](/reference/scenarios) | Named server states, programmatic + HTTP control |
| [Proxy & forward](/reference/proxy) | Pass-through, `ctx.forward()` mutate-then-return |
| [Recorder](/reference/recorder) | Chrome extension, `recorder.mocksDir`, server file patching |
| [CLI](/reference/cli) | `--port` / `--proxy` / `--recorder` / `--tui` |
| [Config](/reference/config) | `MockrConfig` shape, top-level options |
