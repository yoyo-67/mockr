import { describe, it, expectTypeOf } from 'vitest';
import { ws } from '../src/ws.js';
import type { WsEndpoint, WsHandle, WsSpec } from '../src/ws.js';
import type { HandlerContext } from '../src/types.js';

type ServerEvent = { type: 'open' } | { type: 'tick'; n: number };
type ClientEvent = { type: 'subscribe' } | { type: 'cancel' };

describe('ws() factory', () => {
  it('returns a WsSpec branded with Out/In/State generics', () => {
    const spec = ws<ServerEvent, ClientEvent, { count: number }>({
      initialState: () => ({ count: 0 }),
      onMessage: ({ data, send, state }) => {
        expectTypeOf(data).toEqualTypeOf<ClientEvent>();
        expectTypeOf(state).toEqualTypeOf<{ count: number }>();
        expectTypeOf(send).parameters.toEqualTypeOf<[ServerEvent]>();
        send({ type: 'tick', n: state.count });
      },
    });
    expectTypeOf(spec).toExtend<WsSpec<ServerEvent, ClientEvent, { count: number }>>();
  });

  it('untyped factory falls back to unknown', () => {
    const spec = ws({ onMessage: ({ data, send }) => { void data; void send; } });
    expectTypeOf(spec).toExtend<WsSpec<unknown, unknown, unknown>>();
  });

  it('typed onConnect / onClose receive matching state', () => {
    ws<ServerEvent, ClientEvent, { ready: boolean }>({
      initialState: () => ({ ready: false }),
      onConnect: ({ state, send }) => {
        expectTypeOf(state).toEqualTypeOf<{ ready: boolean }>();
        expectTypeOf(send).parameters.toEqualTypeOf<[ServerEvent]>();
      },
      onClose: ({ state, code, reason }) => {
        expectTypeOf(state).toEqualTypeOf<{ ready: boolean }>();
        expectTypeOf(code).toEqualTypeOf<number>();
        expectTypeOf(reason).toEqualTypeOf<string>();
      },
    });
  });
});

describe('Endpoints map with WsEndpoint', () => {
  it('ctx.endpoint(wsUrl) returns WsHandle<Out>', () => {
    type Endpoints = {
      '/ws/agent': WsEndpoint<ServerEvent, ClientEvent>;
    };
    const ctx = {} as HandlerContext<Endpoints>;
    const handle = ctx.endpoint('/ws/agent');
    expectTypeOf(handle).toExtend<WsHandle<ServerEvent>>();
    expectTypeOf(handle.broadcast).parameters.toEqualTypeOf<[ServerEvent, ((c: import('../src/ws.js').WsClient) => boolean)?]>();
    expectTypeOf(handle.count()).toEqualTypeOf<number>();
  });

  it('mixed endpoints — list, record, ws — each get the right handle', () => {
    type Endpoints = {
      '/users': { id: number }[];
      '/config': { theme: string };
      '/ws/agent': WsEndpoint<ServerEvent, ClientEvent>;
    };
    const ctx = {} as HandlerContext<Endpoints>;
    expectTypeOf(ctx.endpoint('/users').data).toEqualTypeOf<{ id: number }[]>();
    expectTypeOf(ctx.endpoint('/config').data).toEqualTypeOf<{ theme: string }>();
    expectTypeOf(ctx.endpoint('/ws/agent')).toExtend<WsHandle<ServerEvent>>();
  });
});
