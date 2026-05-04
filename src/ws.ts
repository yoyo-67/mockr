import type { ParseableSchema } from './types.js';

/**
 * Brand symbol applied to every value returned from `ws({...})`. Distinguishes
 * a ws spec (factory output) from a plain object at runtime.
 */
export const WS_SPEC_BRAND: unique symbol = Symbol.for('mockr.WsSpec') as never;

/** Phantom marker used by the `WsEndpoint<Out, In>` sentinel type. */
declare const _wsBrand: unique symbol;

/**
 * Sentinel type tagging a key in an `Endpoints` map as a WebSocket endpoint.
 * The `Out` parameter types frames mockr sends to clients; `In` types frames
 * mockr receives. Pure type-level marker — never instantiated at runtime.
 */
export type WsEndpoint<Out = unknown, In = unknown> = {
  readonly [_wsBrand]: true;
  readonly _out: Out;
  readonly _in: In;
};

/** A connected client as seen from `WsHandle` (cross-endpoint reads). */
export interface WsClient {
  id: string;
  query: Record<string, string | string[]>;
  params: Record<string, string>;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  state: unknown;
  subprotocol?: string;
  connectedAt: Date;
}

/**
 * Cross-endpoint handle exposed via `ctx.endpoint('/ws/...')` / `server.endpoint('/ws/...')`.
 * Mirrors the `ListHandle` / `RecordHandle` pattern but with WS-shaped methods.
 */
export interface WsHandle<Out = unknown> {
  broadcast(message: Out, filter?: (c: WsClient) => boolean): void;
  send(clientId: string, message: Out): void;
  close(clientId?: string, code?: number, reason?: string): void;
  clients(): readonly WsClient[];
  count(): number;
}

/** Hook params common to onConnect / onMessage / onClose. */
export interface WsHookCtx<Out, State> {
  send: (out: Out) => void;
  state: State;
  query: Record<string, string | string[]>;
  params: Record<string, string>;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  id: string;
}

export interface WsConnectCtx<Out, State> extends WsHookCtx<Out, State> {
  subprotocol?: string;
}

export interface WsMessageCtx<Out, In, State> extends WsHookCtx<Out, State> {
  data: In;
  signal: AbortSignal;
}

export interface WsCloseCtx<State> {
  state: State;
  code: number;
  reason: string;
  id: string;
}

export interface WsFactoryOpts<Out, In, State> {
  /** Schema validating each inbound frame. Output must extend `In`. */
  message?: ParseableSchema<In>;
  /** Schema validating connection query string. */
  query?: ParseableSchema<Record<string, unknown>>;
  /** Schema validating URL path params. */
  params?: ParseableSchema<Record<string, string>>;
  /** Per-connection state factory. Called once on each upgrade. */
  initialState?: () => State;
  /** Fires once after upgrade. */
  onConnect?: (ctx: WsConnectCtx<Out, State>) => void | Promise<void>;
  /** Fires for every inbound frame after schema validation passes. */
  onMessage?: (ctx: WsMessageCtx<Out, In, State>) => void | Promise<void>;
  /** Fires after socket closes (peer or server initiated). */
  onClose?: (ctx: WsCloseCtx<State>) => void | Promise<void>;
}

/**
 * Branded ws spec produced by the `ws({...})` factory. Carries the hooks plus
 * the `WS_SPEC_BRAND` so runtime code can distinguish a ws spec from a plain
 * object or a `HandlerSpec`.
 */
export interface WsSpec<Out = unknown, In = unknown, State = unknown>
  extends WsFactoryOpts<Out, In, State> {
  readonly [WS_SPEC_BRAND]: true;
}

/**
 * Factory that builds a branded `WsSpec` from lifecycle hooks and optional
 * schemas. Mirrors `handler({...})`'s shape so juniors learn one factory
 * pattern.
 */
export function ws<Out = unknown, In = unknown, State = unknown>(
  opts: WsFactoryOpts<Out, In, State>,
): WsSpec<Out, In, State> {
  return {
    ...opts,
    [WS_SPEC_BRAND]: true,
  };
}

/** Type guard — true iff `value` is a branded ws spec. */
export function isWsSpec(value: unknown): value is WsSpec {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[WS_SPEC_BRAND] === true
  );
}
