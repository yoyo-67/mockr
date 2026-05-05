# WebSocket reference

`ws({...})` builds a branded `WsSpec` attached to `endpoint.ws`. Mockr serves the WS upgrade on the same port as HTTP.

## Endpoint shape

```ts
import { mockr, ws, type WsEndpoint } from '@yoyo-org/mockr';

type ServerEvent = { type: 'tick'; n: number };
type ClientEvent = { type: 'subscribe' };

type Endpoints = {
  '/ws/clock': WsEndpoint<ServerEvent, ClientEvent>;
};

mockr<Endpoints>({
  endpoints: [
    {
      url: '/ws/clock',
      ws: ws<ServerEvent, ClientEvent>({ /* hooks */ }),
    },
  ],
});
```

`WsEndpoint<Out, In>` is a phantom type — never instantiated. Mockr reads it to type `WsHandle<Out>` returned by `ctx.endpoint(url)`.

## `ws({...})` factory

```ts
ws<Out, In, State>({
  message?:      ParseableSchema<In>,
  query?:        ParseableSchema<Record<string, unknown>>,
  params?:       ParseableSchema<Record<string, string>>,
  initialState?: () => State,
  onConnect?:    (ctx: WsConnectCtx<Out, State>) => void | Promise<void>,
  onMessage?:    (ctx: WsMessageCtx<Out, In, State>) => void | Promise<void>,
  onClose?:      (ctx: WsCloseCtx<State>) => void | Promise<void>,
});
```

| Hook | Fires | `ctx` shape |
|---|---|---|
| `onConnect` | once after upgrade | `{ send, state, query, params, headers, id, subprotocol }` |
| `onMessage` | per inbound frame (after schema) | `{ data, send, state, query, params, headers, id, signal }` |
| `onClose`   | once after socket close | `{ state, code, reason, id }` |

`send(frame)` writes to the **current** client. Use `WsHandle.broadcast` (below) to fan out.

`signal` is an `AbortSignal` that fires on close — wire it through long async work to bail cleanly:

```ts
onMessage: async ({ data, send, signal }) => {
  for (let i = 0; i < 100; i++) {
    if (signal.aborted) return;
    await sleep(50);
    send({ type: 'tick', n: i });
  }
},
```

## Schemas

`message` validates each inbound frame after JSON-decode. Failure emits `{ type: '__mockr_error', code, message }` to the client and skips `onMessage`.

`query` and `params` validate at upgrade. Failure rejects with HTTP `400` — the socket never opens. Inside `onConnect` and `onMessage`, both are typed from the schema output.

## Per-connection `state`

`initialState()` runs once per client. Mutate `state` in any hook — mockr reads the same object on subsequent frames.

```ts
ws<Out, In, { count: number }>({
  initialState: () => ({ count: 0 }),
  onMessage: ({ state, send }) => { state.count += 1; send({ type: 'ack', n: state.count }); },
});
```

## `WsHandle<Out>`

Returned by `ctx.endpoint('/ws/...')` (handler) or `server.endpoint('/ws/...')` (outside).

| Member | Description |
|---|---|
| `broadcast(frame, filter?)` | Send to every client. Optional `(client) => boolean` predicate. |
| `send(clientId, frame)` | Send to one client. |
| `close(clientId?, code?, reason?)` | Close one client (or all). |
| `clients()` | `readonly WsClient[]` snapshot. |
| `count()` | Number of open connections. |

## `WsClient`

```ts
interface WsClient {
  id: string;
  query: Record<string, string | string[]>;
  params: Record<string, string>;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  state: unknown;
  subprotocol?: string;
  connectedAt: Date;
}
```

The handle's view of a connected client. `state` is `unknown` from the cross-endpoint side — narrow it via the originating endpoint's known type if you need to read.

## Cross-endpoint broadcast

A common pattern: HTTP webhook → fan-out to WS subscribers.

```ts
{
  url: '/api/webhooks/order-shipped',
  method: 'POST',
  handler: handler({
    fn: (req, ctx) => {
      ctx.endpoint('/ws/orders').broadcast({
        type: 'shipped',
        orderId: (req.body as { orderId: string }).orderId,
      });
      return { body: { ok: true } };
    },
  }),
}
```

## Brand symbols

`WS_SPEC_BRAND` (symbol) and `isWsSpec(value)` (type guard) are exported for advanced introspection — you don't need them for typical usage.
