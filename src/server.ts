import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type {
  MockrConfig,
  MockrServer,
  MockrRequest,
  HandlerResult,
  Middleware,
  HandlerContext,
  ParseableSchema,
} from './types.js';
import type { EndpointHandle } from './endpoint-handle.js';
import { createListHandle } from './list-handle.js';
import { createRecordHandle, type RecordHandle } from './record-handle.js';
import { createEndpointHandle } from './endpoint-handle.js';
import { isHandlerSpec } from './handler.js';
import { createMatcher } from './router.js';
import { createRecorder, type Recorder } from './recorder.js';
import { createMemorySessionStore, type MemorySessionStore } from './memory-session.js';
import { parseQuery, getPath, readBody, sendJson, sendRaw } from './http-utils.js';
import { handleControlRoute, type InternalEndpoint } from './control-routes.js';

function parseCli(): { tui?: boolean; port?: number; proxy?: string; recorder?: boolean } {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        tui: { type: 'boolean' },
        port: { type: 'string' },
        proxy: { type: 'string' },
        recorder: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: false,
    });
    if (values.help) {
      console.log(`mockr — Mock API server for frontend prototyping

Usage:
  npx tsx <server-file.ts> [options]

Options:
  --port <number>   Port to listen on (overrides the port in your config)
  --proxy <url>     Proxy unmatched requests to this URL
  --tui             Enable the terminal UI
  --recorder        Enable the recorder (record & map network traffic)
  --help, -h        Show this help message`);
      process.exit(0);
    }
    return {
      tui: values.tui as boolean | undefined,
      port: values.port ? Number(values.port) : undefined,
      proxy: values.proxy as string | undefined,
      recorder: values.recorder as boolean | undefined,
    };
  } catch {
    return {};
  }
}

export async function mockr<TEndpoints = Record<string, unknown>>(
  config: MockrConfig<TEndpoints> = {},
): Promise<MockrServer<TEndpoints>> {
  // CLI args override config
  const cli = parseCli();
  if (cli.tui !== undefined) config = { ...config, tui: cli.tui };
  if (cli.port !== undefined) config = { ...config, port: cli.port };
  if (cli.proxy !== undefined) config = { ...config, proxy: { ...config.proxy, target: cli.proxy } };
  if (cli.recorder) config = { ...config, recorder: config.recorder ?? {} };

  // Initialize recorder
  const recorderEnabled = !!config.recorder;
  let recorder: Recorder | null = null;
  const mocksDir = resolve(config.recorder?.mocksDir ?? 'mocks');

  const serverFile = config.recorder?.serverFile ? resolve(config.recorder.serverFile) : null;

  if (recorderEnabled) {
    const sessionsDir = config.recorder?.sessionsDir ?? resolve('sessions');
    recorder = createRecorder({ sessionsDir });
  }

  const endpoints: InternalEndpoint[] = [];
  const middlewares: Middleware[] = [...(config.middleware || [])];
  const scenarios = config.scenarios || {};
  const memorySessions: MemorySessionStore = createMemorySessionStore();
  let proxyEnabled = !!config.proxy;
  let proxyTarget = config.proxy?.target ?? null;
  const proxyTargets = config.proxy?.targets ?? null;
  let activeScenarioName: string | null = null;

  // Per-endpoint record handles (for `data: T` non-array endpoints).
  // Stored separately so `server.endpoint()` returns the same instance the
  // request handler reads from.
  const recordHandles = new Map<InternalEndpoint, RecordHandle<object>>();

  function pushDataEndpoint(
    url: string | RegExp,
    matcher: ReturnType<typeof createMatcher>,
    method: string | undefined,
    initial: unknown,
    idKey: string,
    filePath?: string,
  ): InternalEndpoint {
    const ep: InternalEndpoint = {
      url,
      method,
      matcher,
      listHandle: null,
      staticBody: undefined,
      staticResponse: { status: 200, headers: {}, body: undefined },
      activeHandler: null,
      idKey,
      isData: true,
      isHandler: false,
      isStatic: false,
      handlerFn: null,
      schemas: null,
      disabled: false,
      filePath,
    };
    if (Array.isArray(initial)) {
      ep.listHandle = createListHandle(initial as Record<string, unknown>[], { idKey });
    } else if (typeof initial === 'object' && initial !== null) {
      recordHandles.set(ep, createRecordHandle(initial as object));
    } else {
      // Primitive `data` — treat as static body (no mutation handle).
      ep.isData = false;
      ep.isStatic = true;
      ep.staticBody = initial;
      ep.staticResponse = { status: 200, headers: {}, body: initial };
    }
    endpoints.push(ep);
    return ep;
  }

  // Load fixture file
  if (config.fixtureFile) {
    const fixtureFilePath = resolve(config.fixtureFile);
    const raw = await readFile(fixtureFilePath, 'utf-8');
    const fixtures = JSON.parse(raw) as Record<string, unknown>;
    for (const [url, value] of Object.entries(fixtures)) {
      if (Array.isArray(value)) {
        pushDataEndpoint(url, createMatcher(url), undefined, value, 'id', fixtureFilePath);
      } else {
        endpoints.push({
          url,
          matcher: createMatcher(url),
          listHandle: null,
          staticBody: value,
          staticResponse: { status: 200, headers: {}, body: value },
          activeHandler: null,
          idKey: 'id',
          isData: false,
          isHandler: false,
          isStatic: true,
          handlerFn: null,
          schemas: null,
          disabled: false,
          filePath: fixtureFilePath,
        });
      }
    }
  }

  // Process endpoint definitions
  for (const def of config.endpoints || []) {
    const urlStr = typeof def.url === 'string' ? def.url : def.url.source;
    const matcher = createMatcher(def.url);

    if ('data' in def && def.data !== undefined) {
      const key = def.idKey || 'id';
      pushDataEndpoint(def.url, matcher, def.method, def.data, key);
    } else if ('dataFile' in def && def.dataFile !== undefined) {
      // Load initial data and re-read from disk on each request (live reload)
      const filePath = resolve(def.dataFile);
      const raw = await readFile(filePath, 'utf-8');
      const fileData = JSON.parse(raw);
      const key = def.idKey || 'id';
      const ep = pushDataEndpoint(def.url, matcher, def.method, fileData, key, filePath);
      ep.filePath = filePath;
      ep.isHandler = true;
      const handlerFn: InternalEndpoint['handlerFn'] = async () => {
        const freshRaw = await readFile(filePath, 'utf-8');
        const freshData = JSON.parse(freshRaw);
        if (Array.isArray(freshData)) {
          if (!ep.listHandle) ep.listHandle = createListHandle(freshData as Record<string, unknown>[], { idKey: key });
          else ep.listHandle.data = freshData as Record<string, unknown>[];
        } else {
          ep.staticBody = freshData;
          ep.staticResponse = { status: 200, headers: {}, body: freshData };
          const rec = recordHandles.get(ep);
          if (rec) rec.replace(freshData as object);
          else recordHandles.set(ep, createRecordHandle(freshData as object));
        }
        return { status: 200, body: freshData };
      };
      ep.handlerFn = handlerFn;
      ep.activeHandler = handlerFn;
    } else if ('handler' in def && def.handler !== undefined) {
      const h = def.handler;
      const isSpec = isHandlerSpec(h);
      const handlerFn = (isSpec ? h.fn : h) as InternalEndpoint['handlerFn'];
      const schemas: InternalEndpoint['schemas'] = isSpec
        ? { body: h.body, query: h.query, params: h.params }
        : null;
      endpoints.push({
        url: def.url,
        method: def.method,
        matcher,
        listHandle: null,
        staticBody: undefined,
        staticResponse: { status: 200, headers: {}, body: undefined },
        activeHandler: handlerFn,
        idKey: 'id',
        isData: false,
        isHandler: true,
        isStatic: false,
        handlerFn,
        schemas,
        disabled: false,
      });
    }
    // No `body` / `response` shorthand — use `data: T` (record) for static
    // payloads, or `handler` for custom status/headers.
    void urlStr;
  }

  /** Pick the right kind of public handle for an endpoint. */
  function getEndpointHandleFor(ep: InternalEndpoint): EndpointHandle<unknown> | null {
    if (ep.listHandle) return ep.listHandle as unknown as EndpointHandle<unknown>;
    const rec = recordHandles.get(ep);
    if (rec) return rec as unknown as EndpointHandle<unknown>;
    return null;
  }

  // Endpoint lookup for handlers
  function getEndpointHandle(url: string): EndpointHandle<unknown> {
    for (const ep of endpoints) {
      const epUrl = typeof ep.url === 'string' ? ep.url : ep.url.source;
      if (epUrl === url) {
        const handle = getEndpointHandleFor(ep);
        if (handle) return handle;
        throw new Error(`Endpoint '${url}' has no data handle (it is a handler-only or static endpoint).`);
      }
    }
    throw new Error(`Endpoint not found: ${url}`);
  }

  const handlerContext: HandlerContext = {
    endpoints: ((url: string) => getEndpointHandle(url)) as HandlerContext['endpoints'],
  };

  /**
   * Build a scenario-flavored handle on top of an endpoint's underlying
   * handle. Adds a writable `handler` slot that mutates `ep.activeHandler`,
   * so old-style `s.endpoint(url).handler = fn` keeps working until issue 009
   * lands declarative scenarios.
   */
  function buildScenarioHandle(ep: InternalEndpoint, base: EndpointHandle<unknown>) {
    return new Proxy(base as object, {
      get(target, prop, receiver) {
        if (prop === 'handler') return ep.activeHandler;
        return Reflect.get(target, prop, receiver);
      },
      set(target, prop, value, receiver) {
        if (prop === 'handler') {
          ep.activeHandler = value as InternalEndpoint['activeHandler'];
          return true;
        }
        return Reflect.set(target, prop, value, receiver);
      },
      has(target, prop) {
        if (prop === 'handler') return true;
        return Reflect.has(target, prop);
      },
    }) as EndpointHandle<unknown>;
  }

  function findEndpointByUrl(url: string): InternalEndpoint | undefined {
    for (const ep of endpoints) {
      const epUrl = typeof ep.url === 'string' ? ep.url : ep.url.source;
      if (epUrl === url) return ep;
    }
    return undefined;
  }

  // Scenarios
  function applyScenario(name: string) {
    for (const ep of endpoints) {
      if (ep.listHandle) ep.listHandle.reset();
      const rec = recordHandles.get(ep);
      if (rec) rec.reset();
      ep.activeHandler = ep.handlerFn;
    }
    const scenarioFn = scenarios[name] as ((s: { endpoint: (url: string) => unknown }) => void) | undefined;
    if (scenarioFn) {
      const setup = {
        endpoint: (url: string) => {
          const ep = findEndpointByUrl(url);
          if (!ep) throw new Error(`Endpoint not found: ${url}`);
          const base = getEndpointHandleFor(ep);
          if (!base) throw new Error(`Endpoint '${url}' has no data handle.`);
          return buildScenarioHandle(ep, base);
        },
      };
      scenarioFn(setup);
    }
    activeScenarioName = name;
  }

  // Data CRUD (list endpoints)
  function handleListCrud(ep: InternalEndpoint, method: string, path: string, body: unknown): HandlerResult | null {
    const list = ep.listHandle;
    if (!list) return null;
    const epUrl = typeof ep.url === 'string' ? ep.url : null;
    if (!epUrl) return null;
    const isExactMatch = path === epUrl;
    const subPath = !isExactMatch && path.startsWith(epUrl + '/') ? path.slice(epUrl.length + 1) : null;

    if (method === 'GET' && isExactMatch) return { status: 200, body: list.data };
    if (method === 'GET' && subPath) {
      const item = list.findById(subPath);
      return item ? { status: 200, body: item } : { status: 404, body: { error: 'Not found' } };
    }
    if (method === 'POST' && isExactMatch) {
      const item = (body || {}) as Record<string, unknown>;
      if (!(ep.idKey in item) || item[ep.idKey] == null) item[ep.idKey] = list.nextId();
      return { status: 201, body: list.insert(item) };
    }
    if (method === 'PUT' && subPath) {
      if (!list.findById(subPath)) return { status: 404, body: { error: 'Not found' } };
      return { status: 200, body: list.update(subPath, (body || {}) as Record<string, unknown>) };
    }
    if (method === 'PATCH' && subPath) {
      if (!list.findById(subPath)) return { status: 404, body: { error: 'Not found' } };
      return { status: 200, body: list.update(subPath, (body || {}) as Record<string, unknown>) };
    }
    if (method === 'DELETE' && subPath) {
      return list.remove(subPath) ? { status: 200, body: { deleted: true } } : { status: 404, body: { error: 'Not found' } };
    }
    return null;
  }

  // Record CRUD (single-object data endpoints)
  function handleRecordCrud(ep: InternalEndpoint, method: string, path: string, body: unknown): HandlerResult | null {
    const rec = recordHandles.get(ep);
    if (!rec) return null;
    const epUrl = typeof ep.url === 'string' ? ep.url : null;
    if (!epUrl || path !== epUrl) return null;

    if (method === 'GET') return { status: 200, body: rec.data };
    if (method === 'PATCH' && body && typeof body === 'object') {
      rec.set(body as Partial<object>);
      return { status: 200, body: rec.data };
    }
    if (method === 'PUT' && body && typeof body === 'object') {
      rec.replace(body as object);
      return { status: 200, body: rec.data };
    }
    if (method === 'DELETE') {
      rec.replace({});
      return { status: 200, body: { deleted: true } };
    }
    return null;
  }

  // Schema validation
  function runSchema(schema: ParseableSchema, data: unknown): { ok: true; data: unknown } | { ok: false; result: HandlerResult } {
    const result = schema.safeParse(data);
    if (result.success) return { ok: true, data: result.data };
    return { ok: false, result: { status: 400, body: { error: 'Validation failed', details: result.error.issues ?? result.error.message } } };
  }

  function validateSchemas(schemas: InternalEndpoint['schemas'], req: MockrRequest): HandlerResult | null {
    if (!schemas) return null;
    if (schemas.body) { const r = runSchema(schemas.body, req.body); if (!r.ok) return r.result; (req as any).body = r.data; }
    if (schemas.query) { const r = runSchema(schemas.query, req.query); if (!r.ok) return r.result; (req as any).query = r.data; }
    if (schemas.params) { const r = runSchema(schemas.params, req.params); if (!r.ok) return r.result; (req as any).params = r.data; }
    return null;
  }

  // Proxy
  async function handleProxy(method: string, url: string, headers: Record<string, string | string[] | undefined>, body: unknown): Promise<HandlerResult | null> {
    if (!proxyTarget) return null;
    const targetUrl = proxyTarget + url;
    const fetchHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (v && k.toLowerCase() !== 'host') fetchHeaders[k] = Array.isArray(v) ? v.join(', ') : v;
    }
    const fetchOpts: RequestInit = { method, headers: fetchHeaders, redirect: 'manual' };
    if (body && method !== 'GET' && method !== 'HEAD') fetchOpts.body = JSON.stringify(body);

    const res = await fetch(targetUrl, fetchOpts);
    const resHeaders: Record<string, string | string[]> = {};
    const skipHeaders = new Set(['content-length', 'transfer-encoding', 'content-encoding', 'set-cookie']);
    res.headers.forEach((val, key) => { if (!skipHeaders.has(key.toLowerCase())) resHeaders[key] = val; });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (setCookies.length) {
      // Strip Domain and Secure so cookies stick on localhost over HTTP.
      resHeaders['set-cookie'] = setCookies.map((c) =>
        c.replace(/;\s*Domain=[^;]+/i, '').replace(/;\s*Secure/i, ''),
      );
    }

    if (res.status >= 300 && res.status < 400) return { status: res.status, body: '', headers: resHeaders };

    const resBody = await res.text();
    const ctRaw = resHeaders['content-type'];
    const contentType = (typeof ctRaw === 'string' ? ctRaw : '').toLowerCase();
    const isJson = contentType.includes('application/json') || contentType.includes('+json');
    if (!isJson) return { raw: true, status: res.status, body: resBody, headers: resHeaders };
    let parsedBody: unknown;
    try { parsedBody = JSON.parse(resBody); } catch { parsedBody = resBody; }
    return { status: res.status, body: parsedBody, headers: resHeaders };
  }

  // Request handler
  async function handleRequest(req: IncomingMessage, res: ServerResponse) {
    const start = performance.now();
    const method = (req.method || 'GET').toUpperCase();
    const fullUrl = req.url || '/';
    const path = getPath(fullUrl);
    const query = parseQuery(fullUrl);
    const body = await readBody(req);
    const reqHeaders: Record<string, string | string[] | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) reqHeaders[k] = v;

    const fakeReq: MockrRequest = { method, path, params: {}, query, headers: reqHeaders, body };

    // Scenario switching
    if (path === '/__mockr/scenario' && method === 'POST') {
      const reqBody = body as { name?: string } | undefined;
      if (reqBody?.name && scenarios[reqBody.name]) {
        applyScenario(reqBody.name);
        return sendJson(res, 200, { scenario: reqBody.name });
      }
      return sendJson(res, 400, { error: 'Unknown scenario' });
    }

    // Control routes (/__mockr/*)
    if (path.startsWith('/__mockr/')) {
      const handled = await handleControlRoute(path, method, body, res, {
        recorder, endpoints, mocksDir, serverFile, scenarios: scenarios as Record<string, unknown>, memorySessions, recordHandles,
      });
      if (handled) return;
    }

    // Pre-middleware
    for (const mw of middlewares) {
      if (mw.pre) {
        const result = await mw.pre(fakeReq);
        if (result && 'body' in result) return sendJson(res, result.status || 200, result.body, result.headers);
      }
    }

    let handlerResult: HandlerResult | null = null;
    let source: 'mock' | 'proxy' | '404' = '404';

    // 1. Try endpoints (first match wins)
    for (const ep of endpoints) {
      if (ep.disabled) continue;

      if (ep.isData) {
        if (ep.activeHandler) {
          const routeMatch = ep.matcher(path);
          if (routeMatch) {
            fakeReq.params = routeMatch.params as Record<string, string>;
            handlerResult = await ep.activeHandler(fakeReq, handlerContext);
            source = 'mock';
            break;
          }
        }
        const epUrl = typeof ep.url === 'string' ? ep.url : null;
        if (epUrl) {
          if (path === epUrl || path.startsWith(epUrl + '/')) {
            if (ep.method && ep.method.toUpperCase() !== method) continue;
            if (ep.listHandle) {
              handlerResult = handleListCrud(ep, method, path, body);
            } else if (recordHandles.has(ep)) {
              handlerResult = handleRecordCrud(ep, method, path, body);
            }
            if (handlerResult) { source = 'mock'; break; }
          }
        }
        continue;
      }

      const routeMatch = ep.matcher(path);
      if (!routeMatch) continue;
      if (ep.method && ep.method.toUpperCase() !== method) continue;

      if (ep.isHandler) {
        const handlerFn = ep.activeHandler;
        if (handlerFn) {
          fakeReq.params = routeMatch.params as Record<string, string>;
          const validationError = validateSchemas(ep.schemas, fakeReq);
          if (validationError) { handlerResult = validationError; source = 'mock'; break; }
          handlerResult = await handlerFn(fakeReq, handlerContext);
          source = 'mock';
          break;
        }
      }

      if (ep.isStatic) {
        if (method === 'GET') {
          handlerResult = { status: ep.staticResponse.status, body: ep.staticResponse.body, headers: ep.staticResponse.headers };
        } else if (method === 'PATCH' && typeof ep.staticBody === 'object' && ep.staticBody !== null) {
          const patched = { ...(ep.staticBody as Record<string, unknown>), ...(body as Record<string, unknown>) };
          ep.staticBody = patched;
          ep.staticResponse = { ...ep.staticResponse, body: patched };
          handlerResult = { status: 200, body: patched };
        } else if (method === 'PUT') {
          ep.staticBody = body;
          ep.staticResponse = { ...ep.staticResponse, body };
          handlerResult = { status: 200, body };
        } else if (method === 'DELETE') {
          ep.staticBody = {};
          ep.staticResponse = { ...ep.staticResponse, body: {} };
          handlerResult = { status: 200, body: { deleted: true } };
        } else {
          handlerResult = { status: ep.staticResponse.status, body: ep.staticResponse.body, headers: ep.staticResponse.headers };
        }
        source = 'mock';
        break;
      }
    }

    // 2. Try memory-session replay (cache hit serves instantly)
    let cachedHit: ReturnType<typeof memorySessions.lookupResponse> = undefined;
    if (!handlerResult) {
      cachedHit = memorySessions.lookupResponse({ method, path, query });
      if (cachedHit) {
        handlerResult = { status: cachedHit.status, body: cachedHit.body, headers: cachedHit.headers };
        source = 'mock';
      }
    }

    // 3. Try proxy
    if (!handlerResult && config.proxy && proxyEnabled) {
      handlerResult = await handleProxy(method, fullUrl, reqHeaders, body);
      if (handlerResult) {
        source = 'proxy';
        const ctHeader = handlerResult.headers && handlerResult.headers['content-type'];
        const contentType = (typeof ctHeader === 'string' ? ctHeader : '') || 'application/json';
        // Pre-serialize once at record time — replay hits skip JSON.stringify entirely.
        const bodyText =
          typeof handlerResult.body === 'string'
            ? handlerResult.body
            : JSON.stringify(handlerResult.body);
        memorySessions.recordResponse(
          { method, path, query },
          {
            status: handlerResult.status || 200,
            headers: handlerResult.headers || {},
            body: handlerResult.body,
            bodyText,
            contentType,
          },
        );
      }
    }

    // 4. 404
    if (!handlerResult) handlerResult = { status: 404, body: { error: 'Not found' } };

    // Post-middleware
    for (const mw of middlewares) {
      if (mw.post) {
        const result = await mw.post(fakeReq, handlerResult);
        if (result && 'body' in result) handlerResult = result;
      }
    }

    const status = handlerResult.status || 200;
    const ms = (performance.now() - start).toFixed(0);
    const tag = source === 'mock' ? 'mock' : source === 'proxy' ? '  ->' : ' 404';
    console.log(`  ${tag}  ${method.padEnd(6)} ${status} ${fullUrl} ${ms}ms`);

    if ('raw' in handlerResult && handlerResult.raw) {
      sendRaw(res, status, handlerResult.body as string | Buffer, handlerResult.headers);
    } else if (cachedHit && cachedHit.bodyText !== undefined) {
      // Fast path: serve the pre-serialized cached body, no re-stringify.
      const headers: Record<string, string | string[]> = {
        'Content-Type': cachedHit.contentType || 'application/json',
        ...cachedHit.headers,
      };
      sendRaw(res, status, cachedHit.bodyText, headers);
    } else {
      sendJson(res, status, handlerResult.body, handlerResult.headers);
    }
  }

  // Start server
  const server = createServer(async (req, res) => {
    try {
      await handleRequest(req, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error(`[mockr] Error handling ${req.method} ${req.url}:`, err);
      sendJson(res, 500, { error: message, stack });
    }
  });

  return new Promise<MockrServer<TEndpoints>>((resolvePromise, reject) => {
    server.listen(config.port ?? 0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') { reject(new Error('Failed to get server address')); return; }
      const port = addr.port;
      const url = `http://localhost:${port}`;

      const mockrServer = {
        url,
        port,
        endpoint(urlKey: string) { return getEndpointHandle(urlKey); },
        use(middleware: Middleware) { middlewares.push(middleware); },
        async scenario(name: string) { applyScenario(name); },
        async reset() {
          for (const ep of endpoints) {
            if (ep.listHandle) ep.listHandle.reset();
            const rec = recordHandles.get(ep);
            if (rec) rec.reset();
            ep.activeHandler = ep.handlerFn;
          }
        },
        async save(savePath: string) {
          const snapshot: Record<string, unknown> = {};
          for (const ep of endpoints) {
            const key = typeof ep.url === 'string' ? ep.url : ep.url.source;
            if (ep.listHandle) snapshot[key] = ep.listHandle.data;
            else {
              const rec = recordHandles.get(ep);
              if (rec) snapshot[key] = rec.data;
              else if (ep.isStatic) snapshot[key] = ep.staticBody;
            }
          }
          await writeFile(resolve(savePath), JSON.stringify(snapshot, null, 2), 'utf-8');
        },
        async close() { return new Promise<void>((res, rej) => { server.close((err) => (err ? rej(err) : res())); }); },
        async setPort(newPort: number) {
          await new Promise<void>((res, rej) => { server.close((err) => (err ? rej(err) : res())); });
          await new Promise<void>((res, rej) => {
            server.listen(newPort, () => {
              const addr = server.address();
              if (!addr || typeof addr === 'string') { rej(new Error('Failed to get server address')); return; }
              (mockrServer as any).url = `http://localhost:${addr.port}`;
              (mockrServer as any).port = addr.port;
              res();
            });
            server.once('error', rej);
          });
        },

        // Endpoint control
        listEndpoints() {
          return endpoints.map((ep) => {
            const epUrl = typeof ep.url === 'string' ? ep.url : ep.url.source;
            const type = ep.isData ? 'data' as const : ep.isHandler ? 'handler' as const : 'static' as const;
            const itemCount = ep.listHandle ? ep.listHandle.data.length : null;
            return { url: epUrl, method: ep.method?.toUpperCase() || 'ALL', type, enabled: !ep.disabled, itemCount };
          });
        },
        enableEndpoint(epUrl: string, method?: string) {
          for (const ep of endpoints) { const u = typeof ep.url === 'string' ? ep.url : ep.url.source; if (u === epUrl && (!method || ep.method?.toUpperCase() === method.toUpperCase())) ep.disabled = false; }
        },
        disableEndpoint(epUrl: string, method?: string) {
          for (const ep of endpoints) { const u = typeof ep.url === 'string' ? ep.url : ep.url.source; if (u === epUrl && (!method || ep.method?.toUpperCase() === method.toUpperCase())) ep.disabled = true; }
        },
        enableAll() { for (const ep of endpoints) ep.disabled = false; },
        disableAll() { for (const ep of endpoints) ep.disabled = true; },

        // Proxy control
        enableProxy() { proxyEnabled = true; },
        disableProxy() { proxyEnabled = false; },
        setProxyTarget(nameOrUrl: string) {
          if (proxyTargets && nameOrUrl in proxyTargets) proxyTarget = proxyTargets[nameOrUrl];
          else proxyTarget = nameOrUrl;
          proxyEnabled = true;
        },
        get isProxyEnabled() { return proxyEnabled; },
        get proxyTarget() { return proxyTarget; },
        get proxyTargets() { return proxyTargets; },

        // Scenario info
        listScenarios() { return Object.keys(scenarios); },
        get activeScenario() { return activeScenarioName; },

        // TUI
        async tui() { const { tui: tuiFn } = await import('./tui.js'); await tuiFn(mockrServer as unknown as MockrServer); },

        // In-memory replay sessions
        sessions: {
          create(name: string) {
            const s = memorySessions.create(name);
            return memorySessions.info(s);
          },
          list() {
            return memorySessions.list().map((s) => memorySessions.info(s));
          },
          get(id: string) {
            const s = memorySessions.get(id);
            if (!s) return undefined;
            return {
              ...memorySessions.info(s),
              entries: [...s.entries.entries()].map(([key, value]) => ({ key, ...value })),
            };
          },
          delete(id: string) {
            return memorySessions.delete(id);
          },
          activate(id: string, mode: 'record' | 'replay') {
            memorySessions.setActive(id, mode);
          },
          deactivate() {
            memorySessions.setActive(null, 'off');
          },
          clear(id: string) {
            memorySessions.clear(id);
          },
          get active() {
            const a = memorySessions.getActive();
            if (!a) return null;
            return { id: a.session.id, name: a.session.name, mode: a.mode };
          },
        },

        // Recorder
        get recorder() {
          if (!recorder) return null;
          const rec = recorder;
          return {
            async startSession(name: string, baseUrl: string) { const s = await rec.startSession(name, baseUrl); return { id: s.id, name: s.name, baseUrl: s.baseUrl }; },
            async stopSession(sessionId: string) { await rec.stopSession(sessionId); },
            async listSessions() {
              const sessions = await rec.listSessions();
              return sessions.map(s => ({ id: s.id, name: s.name, baseUrl: s.baseUrl, startedAt: s.startedAt, stoppedAt: s.stoppedAt, entryCount: s.entries.length }));
            },
            async loadSession(sessionId: string) {
              const s = await rec.loadSession(sessionId);
              return { id: s.id, name: s.name, entries: s.entries.map(e => ({ url: e.url, method: e.method, status: e.status, size: e.size })) };
            },
            async mapToFile(sid: string, eIds: string[], options?: { generateTypes?: boolean }) {
              const result = await fetch(`${url}/__mockr/map`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: sid, entryIds: eIds, generateTypes: options?.generateTypes }),
              });
              return result.json();
            },
          };
        },
      };

      // Print startup banner
      if (!config.tui) {
        const mockedUrls = endpoints
          .filter((ep) => !ep.disabled && typeof ep.url === 'string' && !ep.url.startsWith('/internal/'))
          .map((ep) => `${(ep.method || 'ALL').toUpperCase().padEnd(6)} ${ep.url}`);
        console.log(`\nmockr running at ${url}\n`);
        if (mockedUrls.length) { console.log(`  Mocked:`); for (const line of mockedUrls) console.log(`    ${line}`); }
        if (proxyTarget) console.log(`  Proxy:  ${proxyTarget}`);
        console.log();
      }

      resolvePromise(mockrServer as unknown as MockrServer<TEndpoints>);

      if (config.tui && process.stdin.isTTY) {
        setTimeout(() => (mockrServer as any).tui(), 0);
      }
    });

    server.on('error', reject);
  });
}
