import type { HandlerSpec } from './handler.js';
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
  endpoints: [keyof TEndpoints] extends [never]
    ? (url: string) => EndpointHandle<unknown[]>
    : <K extends keyof TEndpoints>(url: K) => EndpointHandle<TEndpoints[K] extends readonly unknown[] | object ? TEndpoints[K] : never>;
}

export interface Middleware {
  name?: string;
  pre?: (req: MockrRequest) => void | HandlerResult | Promise<void | HandlerResult>;
  post?: (req: MockrRequest, res: HandlerResult) => void | HandlerResult | Promise<void | HandlerResult>;
}

export type EndpointDef<TEndpoints = Record<string, unknown>> =
  | {
      url: string | RegExp;
      method?: string;
      data: unknown;
      idKey?: string;
      dataFile?: never;
      handler?: never;
      body?: never;
      response?: never;
      methods?: never;
    }
  | {
      url: string | RegExp;
      method?: string;
      dataFile: string;
      idKey?: string;
      data?: never;
      handler?: never;
      body?: never;
      response?: never;
      methods?: never;
    }
  | {
      url: string | RegExp;
      method?: string;
      handler:
        | ((req: MockrRequest, ctx: HandlerContext<TEndpoints>) => HandlerResult | Promise<HandlerResult>)
        | HandlerSpec<any, any, any, TEndpoints>;
      data?: never;
      dataFile?: never;
      body?: never;
      response?: never;
      methods?: never;
    };

export interface ScenarioSetup<TEndpoints = Record<string, unknown>> {
  endpoint: [keyof TEndpoints] extends [never]
    ? (url: string) => EndpointHandle<unknown[]>
    : <K extends keyof TEndpoints>(url: K) => EndpointHandle<TEndpoints[K] extends readonly unknown[] | object ? TEndpoints[K] : never>;
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
    : <K extends keyof TEndpoints>(url: K) => EndpointHandle<TEndpoints[K] extends readonly unknown[] | object ? TEndpoints[K] : never>;
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
