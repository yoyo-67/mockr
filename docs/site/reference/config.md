# Config reference

`MockrConfig<E>` — what `mockr<E>(config)` accepts.

```ts
interface MockrConfig<E = Record<string, unknown>> {
  port?:        number;            // default: random free port
  endpoints:    EndpointDef<E>[];
  proxy?:       ProxyConfig;
  middleware?:  Middleware[];
  scenarios?:   Record<string, ScenarioSetup<E>>;
  recorder?:    RecorderOptions;
  tui?:         boolean;
  cors?:        boolean | CorsOptions; // permissive cors helper
}
```

| Field | Description |
|---|---|
| `port` | Listen port. Defaults to a random free one — read `server.port` after `await`. |
| `endpoints` | Endpoint definitions — see [Endpoints reference](/reference/endpoints). |
| `proxy` | Pass-through target for unmatched routes. See [Proxy](/reference/proxy). |
| `middleware` | Pre-routing pipeline. See [Middleware](/reference/middleware). |
| `scenarios` | Named server states. See [Scenarios](/reference/scenarios). |
| `recorder` | Enables the recorder + Chrome extension hand-off. See [Recorder](/reference/recorder). |
| `tui` | Auto-launch the terminal UI on start. |
| `cors` | Convenience flag — set `true` for permissive CORS, or pass an options object. |

## Async return

`mockr<E>(config)` returns a `Promise<MockrServer>`. Always `await` — the port is bound before the promise resolves.

```ts
const server = await mockr<Endpoints>({ /* ... */ });
console.log('listening on', server.port);
```

## `endpoints<E>([...])` helper

Per-group runtime no-op that type-checks endpoint definitions in a separate file:

```ts
// src/mocks/cart.ts
import { endpoints } from '@yoyo-org/mockr';
import type { Endpoints } from '../types.js';

export const cartMocks = endpoints<Endpoints>([
  { url: '/api/cart', data: [] },
]);
```

Top-level `mockr<E>(...)` keeps the explicit generic — groups compose into it.

## `file<T>(path)`

Brands a JSON path with a type so `dataFile` flows the type through:

```ts
import { file } from '@yoyo-org/mockr';
import type { Todo } from './types.js';

{ url: '/api/todos', dataFile: file<Todo[]>('./todos.json') }
//        ListHandle<Todo> on the cross-endpoint side
```

Runtime value is the path string. The watcher reloads on `fs.watch` events (debounced 100ms).
