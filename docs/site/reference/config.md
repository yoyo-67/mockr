# Config reference

`MockrConfig<E>` — what `mockr<E>(config)` accepts.

```ts
interface MockrConfig<E = Record<string, unknown>> {
  port?:        number;            // default: random free port
  groups?:      EndpointDef<E>[][]; // mockGroup().done() results
  endpoints?:   EndpointDef<E>[];   // lower-level defs (dataFile / ws)
  proxy?:       ProxyConfig;
  middleware?:  Middleware[];
  scenarios?:   Record<string, ScenarioSetup<E>>;
  verify?:      boolean;
  onDrift?:     (d: DriftReport) => void;
  recorder?:    RecorderOptions;
  tui?:         boolean;
  cors?:        boolean | CorsOptions; // permissive cors helper
}
```

| Field | Description |
|---|---|
| `port` | Listen port. Defaults to a random free one — read `server.port` after `await`. |
| `groups` | Array of [`mockGroup().done()`](/reference/builder) results. All groups share one `Endpoints` map, so they compose with no cast. The preferred multi-file path. |
| `endpoints` | Lower-level array of [endpoint defs](/reference/endpoints). Use it for file-backed (`dataFile`) and WebSocket (`ws`) endpoints, which the builder doesn't emit. Can sit alongside `groups`. |
| `proxy` | Pass-through target for unmatched routes. See [Proxy](/reference/proxy). |
| `middleware` | Pre-routing pipeline. See [Middleware](/reference/middleware). |
| `scenarios` | Named server states. See [Scenarios](/reference/scenarios). |
| `verify` | Validate every served body against its endpoint's `responseSchema`; mismatches go to `onDrift` and a console warning. See [Verify](/reference/verify). |
| `onDrift` | Callback for `verify` mismatches — `({ url, method, issues })`. |
| `recorder` | Enables the recorder + Chrome extension hand-off. See [Recorder](/reference/recorder). |
| `tui` | Auto-launch the terminal UI on start. |
| `cors` | Convenience flag — set `true` for permissive CORS, or pass an options object. |

Provide `groups`, `endpoints`, or both — at least one source of routes.

## Async return

`mockr<E>(config)` returns a `Promise<MockrServer>`. Always `await` — the port is bound before the promise resolves.

```ts
const server = await mockr<Endpoints>({ /* ... */ });
console.log('listening on', server.port);
```

## Composing across files

Each file exports a [`mockGroup<Endpoints>().done()`](/reference/builder) over one shared `Endpoints` map, and the server lists them under `groups`:

```ts
// src/mocks/cart.ts
import { mockGroup } from '@yoyo-org/mockr';
import type { Endpoints } from '../types.js';

export const cartMocks = mockGroup<Endpoints>()
  .data('/internal/cart', [])
  .get('/api/cart', (_req, ctx) => ctx.endpoint('/internal/cart').data)
  .done();

// src/server.ts
await mockr<Endpoints>({ groups: [cartMocks, todoMocks] });
```

Because every group is typed against the same map, they compose with no `EndpointDef<any>` cast. File-backed (`dataFile`) and WebSocket (`ws`) defs go in `endpoints` alongside the groups.

## `file<T>(path)`

Brands a JSON path with a type so `dataFile` flows the type through:

```ts
import { file } from '@yoyo-org/mockr';
import type { Todo } from './types.js';

{ url: '/api/todos', dataFile: file<Todo[]>('./todos.json') }
//        ListHandle<Todo> on the cross-endpoint side
```

Runtime value is the path string. The watcher reloads on `fs.watch` events (debounced 100ms).
