import type { HandlerSpec } from './handler.js';
import type { FileRef } from './file.js';
import type { EndpointHandle } from './endpoint-handle.js';

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

export interface HandlerContext<TEndpoints = Record<string, unknown>> {
  endpoint: [keyof TEndpoints] extends [never]
    ? (url: string) => EndpointHandle<unknown[]>
    : <K extends keyof TEndpoints>(url: K) => EndpointHandle<TEndpoints[K] extends readonly unknown[] | object ? TEndpoints[K] : unknown>;
}

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

export type EndpointDef<TEndpoints = Record<string, unknown>> =
  | {
      url: string | RegExp;
      method?: string;
      data: unknown;
      idKey?: string;
      methods?: MethodMap<TEndpoints>;
      dataFile?: never;
      handler?: never;
      body?: never;
      response?: never;
    }
  | {
      url: string | RegExp;
      method?: string;
      dataFile: FileRef<unknown> | string;
      idKey?: string;
      methods?: MethodMap<TEndpoints>;
      data?: never;
      handler?: never;
      body?: never;
      response?: never;
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
      data?: never;
      dataFile?: never;
      body?: never;
      response?: never;
      methods?: never;
    }
  | {
      url: string | RegExp;
      methods: MethodMap<TEndpoints>;
      method?: never;
      data?: never;
      dataFile?: never;
      handler?: never;
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
  middleware?: Middleware[];
  scenarios?: Record<string, (s: ScenarioSetup<TEndpoints>) => void>;
  fixtureFile?: string;
  proxy?: { target: string; targets?: Record<string, string> };
  tui?: boolean;
  recorder?: { sessionsDir?: string; mocksDir?: string; serverFile?: string };
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
