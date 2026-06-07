import type { HandlerSpec } from './handler.js';
import type { FileRef } from './file.js';
import type { EndpointHandle } from './endpoint-handle.js';
import type { WsSpec } from './ws.js';

export type { EndpointHandle } from './endpoint-handle.js';

/** Minimal schema interface compatible with Zod's .safeParse() */
export interface ParseableSchema<T = unknown> {
  safeParse(data: unknown):
    | { success: true; data: T }
    | { success: false; error: { message?: string; issues?: unknown[] } };
}

export interface MockrRequest<
  T extends { body?: unknown; params?: Record<string, string>; query?: Record<string, unknown> } = {},
> {
  method: string;
  path: string;
  params: T extends { params: infer P } ? P : Record<string, string>;
  query: T extends { query: infer Q } ? Q : Record<string, string | string[]>;
  headers: Record<string, string | string[] | undefined>;
  body: T extends { body: infer B } ? B : unknown;
}

export type HandlerResult =
  | { body: unknown; status?: number; headers?: Record<string, string | string[]> }
  | { status: number; body: unknown; headers?: Record<string, string | string[]> }
  | { raw: true; body: string | Buffer; status: number; headers: Record<string, string | string[]> };

export interface ForwardPatch {
  path?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export type ForwardResult<T = unknown> = {
  status: number;
  body: T;
  headers: Record<string, string | string[]>;
  raw?: boolean;
};

type CurrentEndpointBody<TEndpoints, K extends keyof TEndpoints> =
  TEndpoints[K] extends readonly (infer U)[] ? U[] : TEndpoints[K];

export interface HandlerContext<TEndpoints = Record<string, unknown>, TCurrentUrl extends keyof TEndpoints | undefined = undefined> {
  endpoint: [keyof TEndpoints] extends [never]
    ? (url: string) => EndpointHandle<unknown[]>
    : <K extends keyof TEndpoints>(url: K) => EndpointHandle<TEndpoints[K] extends readonly unknown[] | object ? TEndpoints[K] : unknown>;
  forward: TCurrentUrl extends keyof TEndpoints
    ? <T = CurrentEndpointBody<TEndpoints, TCurrentUrl>>(patch?: ForwardPatch) => Promise<ForwardResult<T>>
    : <T = unknown>(patch?: ForwardPatch) => Promise<ForwardResult<T>>;
  /** Error response shorthand: `{ status, body: message ? { error: message } : undefined }`. */
  error(status: number, message?: string): ShorthandResult;
  /** Created shorthand: `{ status: 201, body }`. */
  created(body: unknown): ShorthandResult;
  /** Empty-response shorthand: `{ status: 204 }`. */
  noContent(): ShorthandResult;
}

/**
 * Result produced by the `ctx` shorthands — always a concrete status and body.
 * Assignable both to `HandlerResult` (old handler factory returns) and to the
 * builder's `TypedResult` explicit-status escape.
 */
export type ShorthandResult = { status: number; body: unknown; headers?: Record<string, string | string[]> };

export interface Middleware {
  name?: string;
  pre?: (req: MockrRequest) => void | HandlerResult | Promise<void | HandlerResult>;
  post?: (req: MockrRequest, res: HandlerResult) => void | HandlerResult | Promise<void | HandlerResult>;
}

/**
 * Map of uppercase HTTP verbs to handler specs. Used as an overlay on `data` /
 * `dataFile` endpoints (overrides specific verbs while default CRUD covers the
 * rest) or stand-alone (no data store, all verbs explicit).
 */
export type HttpVerb = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

/**
 * `MethodMap` values use `HandlerSpec<any, any, any, any>` (TEndpoints = any)
 * so groups composed via intersection (`endpoints<A>` + `endpoints<B>` into
 * `mockr<A & B>`) typecheck without a bivariance hack on each verb slot.
 *
 * Trade-off: `ctx.endpoint(url)` inside a method-map handler is typed against
 * `Record<string, unknown>` by default. Users wanting precise typing can pass
 * an explicit generic to `handler<E>({ fn: (req, ctx) => ... })`.
 */
export type MethodMap<_TEndpoints = unknown> = Partial<
  Record<HttpVerb, HandlerSpec<any, any, any, any>>
>;

/**
 * Per-endpoint delay applied before the handler runs (post-global-`pre`
 * middleware). `number` = fixed ms. `{ min, max }` = uniform jitter window.
 * Overrides any global `delay()` middleware for the matched route. WS
 * endpoints reject this field — see ADR-0001.
 */
export type EndpointDelay = number | { min: number; max: number };

export type EndpointDef<TEndpoints = Record<string, unknown>> =
  | {
      url: string | RegExp;
      method?: string;
      data: unknown;
      /**
       * Loader (from `.data(url, fn)`). When present, the store is filled once
       * from the loader on first access, then owned (CRUD sticks). A param'd URL
       * runs the loader once per resolved param-set (one store per partition).
       */
      load?: (req: MockrRequest, ctx: HandlerContext<TEndpoints>) => unknown | Promise<unknown>;
      idKey?: string;
      methods?: MethodMap<TEndpoints>;
      delay?: EndpointDelay;
      responseSchemas?: Partial<Record<HttpVerb, ParseableSchema>>;
      dataFile?: never;
      handler?: never;
      body?: never;
      response?: never;
      ws?: never;
    }
  | {
      url: string | RegExp;
      method?: string;
      dataFile: FileRef<unknown> | string;
      idKey?: string;
      methods?: MethodMap<TEndpoints>;
      delay?: EndpointDelay;
      data?: never;
      handler?: never;
      body?: never;
      response?: never;
      ws?: never;
    }
  | {
      url: string | RegExp;
      method?: string;
      // `BivariantHandler` makes `TEndpoints` bivariant in the function-arg
      // position so groups composed via intersection (`endpoints<A>` +
      // `endpoints<B>` into `mockr<A & B>`) typecheck. Without this hack,
      // strict variance rejects the assignment because `HandlerContext<T>`
      // varies contravariantly in `T`.
      handler:
        | BivariantHandler<TEndpoints>
        | HandlerSpec<any, any, any, TEndpoints>;
      delay?: EndpointDelay;
      responseSchemas?: Partial<Record<HttpVerb, ParseableSchema>>;
      data?: never;
      dataFile?: never;
      body?: never;
      response?: never;
      methods?: never;
      ws?: never;
    }
  | {
      url: string | RegExp;
      methods: MethodMap<TEndpoints>;
      delay?: EndpointDelay;
      responseSchemas?: Partial<Record<HttpVerb, ParseableSchema>>;
      method?: never;
      data?: never;
      dataFile?: never;
      handler?: never;
      body?: never;
      response?: never;
      idKey?: never;
      ws?: never;
    }
  | {
      url: string | RegExp;
      ws: WsSpec<any, any, any>;
      delay?: never;
      method?: never;
      data?: never;
      dataFile?: never;
      handler?: never;
      methods?: never;
      body?: never;
      response?: never;
      idKey?: never;
    };

/**
 * Bivariance hack: by stuffing the function signature into a method slot,
 * TS uses bivariant param checking even under `strictFunctionTypes`. This
 * lets handlers declared against a group's `T` slot into a wider `T'` at the
 * `mockr<T'>` call site.
 */
export type BivariantHandler<TEndpoints> = {
  bivarianceHack(
    req: MockrRequest,
    ctx: HandlerContext<TEndpoints>,
  ): HandlerResult | Promise<HandlerResult>;
}['bivarianceHack'];

/**
 * Mutable handle adapter passed to scenario callbacks. Exposes the same shape
 * as `EndpointHandle<T>` plus a writable `handler` slot — letting scenarios
 * override an endpoint's handler without redeclaring the endpoint.
 *
 * @deprecated The `handler` slot is a transitional escape hatch kept for
 * v0.3.0 scenario migration. Issue 009 replaces this with declarative
 * scenario patches.
 */
export type ScenarioEndpointHandle<T> = EndpointHandle<T> & {
  handler:
    | ((req: MockrRequest, ctx: HandlerContext<any>) => HandlerResult | Promise<HandlerResult>)
    | null;
};

export interface ScenarioSetup<TEndpoints = Record<string, unknown>> {
  endpoint: [keyof TEndpoints] extends [never]
    ? (url: string) => ScenarioEndpointHandle<unknown[]>
    : <K extends keyof TEndpoints>(url: K) => ScenarioEndpointHandle<TEndpoints[K] extends readonly unknown[] | object ? TEndpoints[K] : unknown>;
}

export interface MockrConfig<TEndpoints = Record<string, unknown>> {
  port?: number;
  endpoints?: EndpointDef<TEndpoints>[];
  /**
   * Mock groups (each the `EndpointDef[]` from a `mockGroup().done()`), flattened
   * into `endpoints` at boot. Lets multiple files compose without widening to
   * `EndpointDef<any>[]` — every group shares the one `TEndpoints` map.
   */
  groups?: ReadonlyArray<ReadonlyArray<EndpointDef<TEndpoints>>>;
  middleware?: Middleware[];
  scenarios?: Record<string, (s: ScenarioSetup<TEndpoints>) => void>;
  fixtureFile?: string;
  proxy?: { target: string; targets?: Record<string, string> };
  tui?: boolean;
  recorder?: { sessionsDir?: string; mocksDir?: string; serverFile?: string };
  /**
   * Validate every served response body against its endpoint's `responseSchema`
   * and report mismatches via `onDrift`. Run with a proxy/forward route to check
   * the real backend against your declared contract; run against mocks to check
   * the mocks themselves haven't drifted. Also enabled by the `--verify` CLI flag.
   */
  verify?: boolean;
  /** Called once per response whose body fails its `responseSchema` (when `verify`). */
  onDrift?: (info: DriftInfo) => void;
}

/** Reported by `onDrift` when a served body fails its endpoint's `responseSchema`. */
export interface DriftInfo {
  url: string;
  method: string;
  issues: unknown;
}

export interface EndpointInfo {
  url: string;
  method: string;
  type: 'data' | 'handler' | 'static';
  enabled: boolean;
  itemCount: number | null;
}

export interface MockrServer<TEndpoints = Record<string, unknown>> {
  url: string;
  port: number;
  endpoint: [keyof TEndpoints] extends [never]
    ? (url: string) => EndpointHandle<unknown[]>
    : <K extends keyof TEndpoints>(url: K) => EndpointHandle<TEndpoints[K] extends readonly unknown[] | object ? TEndpoints[K] : unknown>;
  use(middleware: Middleware): void;
  scenario(name: string): Promise<void>;
  reset(): Promise<void>;
  save(path: string): Promise<void>;
  close(): Promise<void>;

  // Endpoint control
  listEndpoints(): EndpointInfo[];
  enableEndpoint(url: string, method?: string): void;
  disableEndpoint(url: string, method?: string): void;
  enableAll(): void;
  disableAll(): void;

  // Proxy control
  enableProxy(): void;
  disableProxy(): void;
  setProxyTarget(nameOrUrl: string): void;
  isProxyEnabled: boolean;
  proxyTarget: string | null;
  proxyTargets: Record<string, string> | null;

  // Port control
  setPort(port: number): Promise<void>;

  /**
   * Set or clear a per-route delay at runtime. Universal API — works on every
   * endpoint kind (data, dataFile, handler, methods). `null` clears the
   * override. Throws synchronously on invalid input. See ADR-0001.
   */
  setEndpointDelay(url: string, value: EndpointDelay | null): void;

  // Scenario info
  listScenarios(): string[];
  activeScenario: string | null;

  // TUI
  tui(): Promise<void>;

  // Recorder
  recorder: {
    startSession(name: string, baseUrl: string): Promise<{ id: string; name: string; baseUrl: string }>;
    stopSession(sessionId: string): Promise<void>;
    listSessions(): Promise<{ id: string; name: string; baseUrl: string; startedAt: number; stoppedAt?: number; entryCount: number }[]>;
    loadSession(sessionId: string): Promise<{ id: string; name: string; entries: { url: string; method: string; status: number; size: number }[] }>;
    mapToFile(sessionId: string, entryIds: string[], options?: { generateTypes?: boolean }): Promise<{ mapped: { url: string; method: string; bodyFile: string; typesFile?: string }[] }>;
  } | null;

  // In-memory replay sessions — record proxy responses once, replay them instantly
  sessions: {
    create(name: string): MemorySessionInfo;
    list(): MemorySessionInfo[];
    get(id: string): (MemorySessionInfo & { entries: MemorySessionEntry[] }) | undefined;
    delete(id: string): boolean;
    activate(id: string, mode: 'record' | 'replay'): void;
    deactivate(): void;
    clear(id: string): void;
    active: { id: string; name: string; mode: 'record' | 'replay' } | null;
  };
}

export interface MemorySessionInfo {
  id: string;
  name: string;
  createdAt: number;
  entryCount: number;
}

export interface MemorySessionEntry {
  key: string;
  status: number;
  headers: Record<string, string>;
  body: unknown;
  contentType: string;
  recordedAt?: number;
}
