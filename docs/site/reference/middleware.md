# Middleware reference

Middleware sits between the HTTP listener and the endpoint router. Each entry has an optional `pre(req)` (before routing) and `post(req, res)` (after the handler runs).

## Built-ins

```ts
import { mockr, logger, delay, auth, errorInjection } from '@yoyo-org/mockr';

await mockr({
  middleware: [
    logger(),                          // ascii log line per request
    delay({ ms: 250 }),                // fixed or per-route delay
    auth({ token: 'secret' }),         // 401 unless Authorization matches
    errorInjection({ rate: 0.05 }),    // 5% chance of 500
  ],
  endpoints: [/* ... */],
});
```

| Helper | Behavior |
|---|---|
| `logger()` | Logs `method url → status` once per request. |
| `delay({ ms })` | Adds latency; supports `(req) => number` for per-route timing. |
| `auth({ token })` | Rejects with `401` unless `Authorization` matches. |
| `errorInjection({ rate })` | Random `500` for chaos testing. |

## Custom middleware

```ts
import type { Middleware } from '@yoyo-org/mockr';

const cors: Middleware = {
  name: 'cors',
  pre(req) {
    if (req.method === 'OPTIONS') {
      return {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
        body: '',
      };
    }
  },
  post(req, res) {
    return {
      ...res,
      headers: { ...(res.headers ?? {}), 'Access-Control-Allow-Origin': '*' },
    };
  },
};
```

`pre` returning a response short-circuits the chain — handler never runs. `post` rewrites the response after the handler. Either may be async.

## Runtime registration

```ts
const server = await mockr({ /* ... */ });
server.use(cors);
```

Works after startup — useful for tests that conditionally inject behavior.
