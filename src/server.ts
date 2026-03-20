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
  EndpointHandle,
  HandlerContext,
  ParseableSchema,
} from './types.js';
import { createEndpointHandle } from './endpoint-handle.js';
import { createMatcher, type MatchFn } from './router.js';
import { createRecorder, type Recorder } from './recorder.js';
import { mkdir } from 'node:fs/promises';
import { generateInterface, urlToFileName, urlToTypeName } from './type-generator.js';

interface InternalEndpoint {
  url: string | RegExp;
  method?: string;
  matcher: MatchFn;
  handle: EndpointHandle;
  idKey: string;
  isData: boolean;
  isHandler: boolean;
  isStatic: boolean;
  disabled: boolean;
  handlerFn: ((req: MockrRequest, ctx: HandlerContext<any>) => HandlerResult | Promise<HandlerResult>) | null;
  schemas: { body?: ParseableSchema; query?: ParseableSchema; params?: ParseableSchema } | null;
}

function parseQuery(url: string): Record<string, string | string[]> {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  const search = new URLSearchParams(url.slice(idx + 1));
  const result: Record<string, string | string[]> = {};
  for (const [key, val] of search) {
    const existing = result[key];
    if (existing === undefined) {
      result[key] = val;
    } else if (Array.isArray(existing)) {
      existing.push(val);
    } else {
      result[key] = [existing, val];
    }
  }
  return result;
}

function getPath(url: string): string {
  const idx = url.indexOf('?');
  return idx === -1 ? url : url.slice(0, idx);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    ...headers,
  });
  res.end(json);
}

function sendRaw(res: ServerResponse, status: number, body: string | Buffer, headers: Record<string, string>) {
  res.writeHead(status, {
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function sendCorsJson(res: ServerResponse, status: number, body: unknown) {
  sendJson(res, status, body, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  });
}

function handleCorsOptions(res: ServerResponse): void {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400',
  });
  res.end();
}


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
  --recorder        Enable the recorder (record & replay network traffic)
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

  // Initialize recorder if enabled
  const recorderEnabled = !!config.recorder;
  let recorder: Recorder | null = null;
  const mocksDir = resolve(config.recorder?.mocksDir ?? 'mocks');

  if (recorderEnabled) {
    const sessionsDir = config.recorder?.sessionsDir ?? resolve('sessions');
    recorder = createRecorder({ sessionsDir });
  }

  const endpoints: InternalEndpoint[] = [];
  const middlewares: Middleware[] = [...(config.middleware || [])];
  const scenarios = config.scenarios || {};
  let proxyEnabled = !!config.proxy;
  let proxyTarget = config.proxy?.target ?? null;
  const proxyTargets = config.proxy?.targets ?? null;
  let activeScenarioName: string | null = null;

  // Load fixture file
  if (config.fixtureFile) {
    const raw = await readFile(resolve(config.fixtureFile), 'utf-8');
    const fixtures = JSON.parse(raw) as Record<string, unknown>;
    for (const [url, value] of Object.entries(fixtures)) {
      if (Array.isArray(value)) {
        const handle = createEndpointHandle(value, url);
        endpoints.push({
          url,
          matcher: createMatcher(url),
          handle,
          isData: true,
          isHandler: false,
          isStatic: false,
          handlerFn: null,
          idKey: 'id',
        schemas: null,
        disabled: false,
        });
      } else {
        const handle = createEndpointHandle([], url);
        handle.body = value;
        handle.response = { status: 200, headers: {}, body: value };
        endpoints.push({
          url,
          matcher: createMatcher(url),
          handle,
          idKey: 'id',
          isData: false,
          isHandler: false,
          isStatic: true,
          handlerFn: null,
          schemas: null,
        disabled: false,
        });
      }
    }
  }

  // Process endpoint definitions
  for (const def of config.endpoints || []) {
    const urlStr = typeof def.url === 'string' ? def.url : def.url.source;
    const matcher = createMatcher(def.url);

    if ('data' in def && def.data !== undefined) {
      const key = (def as any).idKey || 'id';
      const handle = createEndpointHandle(def.data as unknown[], urlStr, key);
      endpoints.push({
        url: def.url,
        method: def.method,
        matcher,
        handle,
        idKey: key,
        isData: true,
        isHandler: false,
        isStatic: false,
        handlerFn: null,
        schemas: null,
        disabled: false,
      });
    } else if ('dataFile' in def && def.dataFile !== undefined) {
      const raw = await readFile(resolve(def.dataFile), 'utf-8');
      const data = JSON.parse(raw) as unknown[];
      const key = (def as any).idKey || 'id';
      const handle = createEndpointHandle(data, urlStr, key);
      endpoints.push({
        url: def.url,
        method: def.method,
        matcher,
        handle,
        idKey: key,
        isData: true,
        isHandler: false,
        isStatic: false,
        handlerFn: null,
        schemas: null,
        disabled: false,
      });
    } else if ('handler' in def && def.handler !== undefined) {
      const h = def.handler;
      const isValidated = typeof h === 'object' && 'fn' in h;
      const handlerFn = (isValidated ? h.fn : h) as InternalEndpoint['handlerFn'];
      const schemas: InternalEndpoint['schemas'] = isValidated
        ? { body: (h as any).body, query: (h as any).query, params: (h as any).params }
        : null;
      const handle = createEndpointHandle([], urlStr);
      handle.handler = handlerFn;
      endpoints.push({
        url: def.url,
        method: def.method,
        matcher,
        handle,
        idKey: 'id',
        isData: false,
        isHandler: true,
        isStatic: false,
        handlerFn,
        schemas,
        disabled: false,
      });
    } else if ('response' in def && def.response !== undefined) {
      const handle = createEndpointHandle([], urlStr);
      handle.body = def.response.body;
      handle.response = {
        status: def.response.status,
        headers: def.response.headers || {},
        body: def.response.body,
      };
      endpoints.push({
        url: def.url,
        method: def.method,
        matcher,
        handle,
        idKey: 'id',
        isData: false,
        isHandler: false,
        isStatic: true,
        handlerFn: null,
        schemas: null,
        disabled: false,
      });
    } else if ('bodyFile' in def && def.bodyFile !== undefined) {
      const raw = await readFile(resolve(def.bodyFile), 'utf-8');
      const body = JSON.parse(raw);
      const handle = createEndpointHandle([], urlStr);
      handle.body = body;
      handle.response = { status: 200, headers: {}, body };
      endpoints.push({
        url: def.url,
        method: def.method,
        matcher,
        handle,
        idKey: 'id',
        isData: false,
        isHandler: false,
        isStatic: true,
        handlerFn: null,
        schemas: null,
        disabled: false,
      });
    } else if ('body' in def && def.body !== undefined) {
      const handle = createEndpointHandle([], urlStr);
      handle.body = def.body;
      handle.response = { status: 200, headers: {}, body: def.body };
      endpoints.push({
        url: def.url,
        method: def.method,
        matcher,
        handle,
        idKey: 'id',
        isData: false,
        isHandler: false,
        isStatic: true,
        handlerFn: null,
        schemas: null,
        disabled: false,
      });
    }
  }

  // Endpoint lookup function for handlers
  function getEndpointHandle(url: string): EndpointHandle {
    for (const ep of endpoints) {
      const epUrl = typeof ep.url === 'string' ? ep.url : ep.url.source;
      if (epUrl === url) return ep.handle;
    }
    throw new Error(`Endpoint not found: ${url}`);
  }

  const handlerContext: HandlerContext = {
    endpoints: ((url: string) => getEndpointHandle(url)) as HandlerContext['endpoints'],
  };

  // Apply default scenario
  function applyScenario(name: string) {
    // Reset all data endpoints first
    for (const ep of endpoints) {
      if (ep.isData) ep.handle.reset();
      if (ep.isHandler) ep.handle.handler = ep.handlerFn;
    }
    const scenarioFn = scenarios[name];
    if (scenarioFn) {
      const setup = {
        endpoint: (url: string) => getEndpointHandle(url),
      };
      (scenarioFn as (s: typeof setup) => void)(setup);
    }
    activeScenarioName = name;
  }

  // Data CRUD route handling
  function handleDataCrud(
    ep: InternalEndpoint,
    method: string,
    path: string,
    body: unknown,
  ): HandlerResult | null {
    const epUrl = typeof ep.url === 'string' ? ep.url : null;
    if (!epUrl) return null;

    // Check if this is a sub-path (e.g., /api/items/1)
    const isExactMatch = path === epUrl;
    const subPath = !isExactMatch && path.startsWith(epUrl + '/') ? path.slice(epUrl.length + 1) : null;

    if (method === 'GET' && isExactMatch) {
      return { status: 200, body: ep.handle.data };
    }

    if (method === 'GET' && subPath) {
      const item = ep.handle.findById(subPath);
      if (!item) return { status: 404, body: { error: 'Not found' } };
      return { status: 200, body: item };
    }

    if (method === 'POST' && isExactMatch) {
      const item = (body || {}) as Record<string, unknown>;
      const idKey = ep.idKey;
      if (!(idKey in item) || item[idKey] == null) {
        item[idKey] = ep.handle.nextId();
      }
      const newItem = ep.handle.insert(item);
      return { status: 201, body: newItem };
    }

    if (method === 'PUT' && subPath) {
      const item = ep.handle.findById(subPath);
      if (!item) return { status: 404, body: { error: 'Not found' } };
      const updated = ep.handle.update(subPath, (body || {}) as Record<string, unknown>);
      return { status: 200, body: updated };
    }

    if (method === 'PATCH' && subPath) {
      const item = ep.handle.findById(subPath);
      if (!item) return { status: 404, body: { error: 'Not found' } };
      const updated = ep.handle.update(subPath, (body || {}) as Record<string, unknown>);
      return { status: 200, body: updated };
    }

    if (method === 'DELETE' && subPath) {
      const removed = ep.handle.remove(subPath);
      if (!removed) return { status: 404, body: { error: 'Not found' } };
      return { status: 200, body: { deleted: true } };
    }

    return null;
  }

  // Schema validation
  function runSchema(schema: ParseableSchema, data: unknown): { ok: true; data: unknown } | { ok: false; result: HandlerResult } {
    const result = schema.safeParse(data);
    if (result.success) return { ok: true, data: result.data };
    const err = result.error;
    return { ok: false, result: { status: 400, body: { error: 'Validation failed', details: err.issues ?? err.message } } };
  }

  function validateSchemas(
    schemas: InternalEndpoint['schemas'],
    req: MockrRequest,
  ): HandlerResult | null {
    if (!schemas) return null;

    if (schemas.body) {
      const r = runSchema(schemas.body, req.body);
      if (!r.ok) return r.result;
      (req as any).body = r.data;
    }

    if (schemas.query) {
      const r = runSchema(schemas.query, req.query);
      if (!r.ok) return r.result;
      (req as any).query = r.data;
    }

    if (schemas.params) {
      const r = runSchema(schemas.params, req.params);
      if (!r.ok) return r.result;
      (req as any).params = r.data;
    }

    return null;
  }

  // Proxy handling
  async function handleProxy(
    method: string,
    url: string,
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): Promise<HandlerResult | null> {
    if (!proxyTarget) return null;

    const targetUrl = proxyTarget + url;
    const fetchHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (v && k.toLowerCase() !== 'host') {
        fetchHeaders[k] = Array.isArray(v) ? v.join(', ') : v;
      }
    }

    const fetchOpts: RequestInit = {
      method,
      headers: fetchHeaders,
      redirect: 'manual',
    };
    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOpts.body = JSON.stringify(body);
    }

    const res = await fetch(targetUrl, fetchOpts);

    const resHeaders: Record<string, string> = {};
    const skipHeaders = new Set(['content-length', 'transfer-encoding', 'content-encoding']);
    res.headers.forEach((val, key) => {
      if (!skipHeaders.has(key.toLowerCase())) {
        resHeaders[key] = val;
      }
    });

    // For redirects, return the status and Location header directly so the browser handles the redirect
    if (res.status >= 300 && res.status < 400) {
      return { status: res.status, body: '', headers: resHeaders };
    }

    const resBody = await res.text();
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(resBody);
    } catch {
      parsedBody = resBody;
    }

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
    for (const [k, v] of Object.entries(req.headers)) {
      reqHeaders[k] = v;
    }

    const fakeReq: MockrRequest = {
      method,
      path,
      params: {},
      query,
      headers: reqHeaders,
      body,
    };

    // Built-in control endpoint: scenario switching
    if (path === '/__mockr/scenario' && method === 'POST') {
      const reqBody = body as { name?: string } | undefined;
      if (reqBody?.name && scenarios[reqBody.name]) {
        applyScenario(reqBody.name);
        return sendJson(res, 200, { scenario: reqBody.name });
      }
      return sendJson(res, 400, { error: 'Unknown scenario' });
    }

    // Recorder routes (CORS-enabled)
    if (path.startsWith('/__mockr/') && path !== '/__mockr/scenario') {
      if (method === 'OPTIONS') {
        return handleCorsOptions(res);
      }

      if (!recorder) {
        return sendCorsJson(res, 400, { error: 'Recorder not enabled. Use --recorder flag or recorder config option.' });
      }

      // POST /__mockr/record/start
      if (path === '/__mockr/record/start' && method === 'POST') {
        const reqBody = body as { name?: string; baseUrl?: string } | undefined;
        const name = reqBody?.name || `session-${Date.now()}`;
        const baseUrl = reqBody?.baseUrl || '';
        const session = await recorder.startSession(name, baseUrl);
        return sendCorsJson(res, 200, { sessionId: session.id, name: session.name, baseUrl: session.baseUrl });
      }

      // POST /__mockr/record
      if (path === '/__mockr/record' && method === 'POST') {
        const reqBody = body as any;
        if (!reqBody?.sessionId) return sendCorsJson(res, 400, { error: 'sessionId required' });
        const entry = await recorder.record({
          sessionId: reqBody.sessionId,
          url: reqBody.url || '',
          method: reqBody.method || 'GET',
          status: reqBody.status || 200,
          contentType: reqBody.contentType || 'application/octet-stream',
          responseHeaders: reqBody.responseHeaders || {},
          body: reqBody.body || '',
          timing: reqBody.timing,
        });
        return sendCorsJson(res, 200, entry);
      }

      // POST /__mockr/record/stop
      if (path === '/__mockr/record/stop' && method === 'POST') {
        const reqBody = body as { sessionId?: string } | undefined;
        if (!reqBody?.sessionId) return sendCorsJson(res, 400, { error: 'sessionId required' });
        const session = await recorder.stopSession(reqBody.sessionId);
        return sendCorsJson(res, 200, { id: session.id, name: session.name, entryCount: session.entries.length });
      }

      // GET /__mockr/sessions
      if (path === '/__mockr/sessions' && method === 'GET') {
        const sessions = await recorder.listSessions();
        return sendCorsJson(res, 200, sessions.map(s => ({
          id: s.id,
          name: s.name,
          baseUrl: s.baseUrl,
          startedAt: s.startedAt,
          stoppedAt: s.stoppedAt,
          entryCount: s.entries.length,
        })));
      }

      // GET/DELETE /__mockr/sessions/:id
      if (path.startsWith('/__mockr/sessions/')) {
        const sessionId = path.slice('/__mockr/sessions/'.length);
        if (method === 'GET') {
          try {
            const session = await recorder.loadSession(sessionId);
            return sendCorsJson(res, 200, session);
          } catch {
            return sendCorsJson(res, 404, { error: 'Session not found' });
          }
        }
        if (method === 'DELETE') {
          await recorder.deleteSession(sessionId);
          return sendCorsJson(res, 200, { deleted: true });
        }
      }

      // POST /__mockr/map — map recorded entries to mockr endpoints as files
      if (path === '/__mockr/map' && method === 'POST') {
        const reqBody = body as { sessionId?: string; entryIds?: string[]; generateTypes?: boolean } | undefined;
        if (!reqBody?.sessionId || !reqBody?.entryIds?.length) {
          return sendCorsJson(res, 400, { error: 'sessionId and entryIds[] required' });
        }

        const session = await recorder.loadSession(reqBody.sessionId);
        const generateTypes = reqBody.generateTypes !== false;
        const mapped: { url: string; method: string; bodyFile: string; typesFile?: string }[] = [];

        await mkdir(mocksDir, { recursive: true });

        for (const entryId of reqBody.entryIds) {
          const entry = session.entries.find(e => e.id === entryId);
          if (!entry) continue;

          const parsed = new URL(entry.url, 'http://placeholder');
          const pathname = parsed.pathname;
          const fileName = urlToFileName(pathname);
          const isJson = entry.contentType.includes('json');
          const ext = isJson ? 'json' : 'txt';
          const bodyFilePath = resolve(mocksDir, `${fileName}.${ext}`);
          const bodyFileRelative = `${mocksDir}/${fileName}.${ext}`;

          // Read body from session storage
          const bodyContent = await readFile(
            resolve(recorder.sessionsDir, reqBody.sessionId, 'entries', `${entryId}.body`),
            'utf-8',
          );

          // Write formatted JSON or raw text
          if (isJson) {
            try {
              const parsed = JSON.parse(bodyContent);
              await writeFile(bodyFilePath, JSON.stringify(parsed, null, 2), 'utf-8');
            } catch {
              await writeFile(bodyFilePath, bodyContent, 'utf-8');
            }
          } else {
            await writeFile(bodyFilePath, bodyContent, 'utf-8');
          }

          // Generate TypeScript interface
          let typesFile: string | undefined;
          if (generateTypes && isJson) {
            try {
              const parsed = JSON.parse(bodyContent);
              const typeName = urlToTypeName(pathname);
              const iface = generateInterface(typeName, parsed);
              const typesPath = resolve(mocksDir, `${fileName}.d.ts`);
              await writeFile(typesPath, iface, 'utf-8');
              typesFile = `${mocksDir}/${fileName}.d.ts`;
            } catch {
              // Skip type generation on error
            }
          }

          // Check if endpoint already exists (update it) or create new
          const epMethod = entry.method.toUpperCase();
          let found = false;
          for (const ep of endpoints) {
            const epUrl = typeof ep.url === 'string' ? ep.url : null;
            if (epUrl === pathname && (!ep.method || ep.method.toUpperCase() === epMethod)) {
              // Update existing endpoint
              const bodyData = isJson ? JSON.parse(bodyContent) : bodyContent;
              ep.handle.body = bodyData;
              ep.handle.response = { status: entry.status === 304 ? 200 : entry.status, headers: {}, body: bodyData };
              found = true;
              break;
            }
          }

          if (!found) {
            const bodyData = isJson ? JSON.parse(bodyContent) : bodyContent;
            const handle = createEndpointHandle([], pathname);
            handle.body = bodyData;
            handle.response = { status: entry.status === 304 ? 200 : entry.status, headers: {}, body: bodyData };
            endpoints.push({
              url: pathname,
              method: epMethod === 'GET' ? undefined : epMethod,
              matcher: createMatcher(pathname),
              handle,
              idKey: 'id',
              isData: false,
              isHandler: false,
              isStatic: true,
              handlerFn: null,
              schemas: null,
              disabled: false,
            });
          }

          mapped.push({ url: pathname, method: epMethod, bodyFile: bodyFileRelative, typesFile });
        }

        return sendCorsJson(res, 200, { mapped });
      }

      // GET /__mockr/map/endpoints — list mapped endpoints
      if (path === '/__mockr/map/endpoints' && method === 'GET') {
        const mapped = endpoints
          .filter(ep => typeof ep.url === 'string' && ep.isStatic)
          .map(ep => ({
            url: typeof ep.url === 'string' ? ep.url : '',
            method: ep.method?.toUpperCase() || 'ALL',
            enabled: !ep.disabled,
          }));
        return sendCorsJson(res, 200, mapped);
      }

      // Catch-all: unknown /__mockr/* route — return 404 instead of falling through to proxy
      return sendCorsJson(res, 404, { error: `Unknown recorder route: ${method} ${path}` });
    }

    // Run pre-middleware
    for (const mw of middlewares) {
      if (mw.pre) {
        const result = await mw.pre(fakeReq);
        if (result && 'body' in result) {
          return sendJson(res, result.status || 200, result.body, result.headers);
        }
      }
    }

    let handlerResult: HandlerResult | null = null;
    let source: 'mock' | 'proxy' | '404' = '404';

    // 1. Try endpoints (first match wins)
    for (const ep of endpoints) {
      if (ep.disabled) continue;

      // For data endpoints, check if handler was overridden (e.g., by scenario)
      if (ep.isData) {
        // If handler was overridden, use it instead of CRUD
        if (ep.handle.handler) {
          const routeMatch = ep.matcher(path);
          if (routeMatch) {
            fakeReq.params = routeMatch.params as Record<string, string>;
            handlerResult = await ep.handle.handler(fakeReq, handlerContext);
            source = 'mock';
            break;
          }
        }
        const epUrl = typeof ep.url === 'string' ? ep.url : null;
        if (epUrl) {
          const isExact = path === epUrl;
          const isSub = path.startsWith(epUrl + '/');
          if (isExact || isSub) {
            if (ep.method && ep.method.toUpperCase() !== method) continue;
            handlerResult = handleDataCrud(ep, method, path, body);
            if (handlerResult) { source = 'mock'; break; }
          }
        }
        continue;
      }

      const routeMatch = ep.matcher(path);
      if (!routeMatch) continue;
      if (ep.method && ep.method.toUpperCase() !== method) continue;

      if (ep.isHandler) {
        const handlerFn = ep.handle.handler;
        if (handlerFn) {
          fakeReq.params = routeMatch.params as Record<string, string>;
          const validationError = validateSchemas(ep.schemas, fakeReq);
          if (validationError) {
            handlerResult = validationError;
            source = 'mock';
            break;
          }
          handlerResult = await handlerFn(fakeReq, handlerContext);
          source = 'mock';
          break;
        }
      }

      if (ep.isStatic) {
        handlerResult = {
          status: ep.handle.response.status,
          body: ep.handle.response.body,
          headers: ep.handle.response.headers,
        };
        source = 'mock';
        break;
      }
    }

    // 2. Try proxy
    if (!handlerResult && config.proxy && proxyEnabled) {
      handlerResult = await handleProxy(method, fullUrl, reqHeaders, body);
      if (handlerResult) source = 'proxy';
    }

    // 3. 404
    if (!handlerResult) {
      handlerResult = { status: 404, body: { error: 'Not found' } };
    }

    // Run post-middleware
    for (const mw of middlewares) {
      if (mw.post) {
        const result = await mw.post(fakeReq, handlerResult);
        if (result && 'body' in result) {
          handlerResult = result;
        }
      }
    }

    const status = handlerResult.status || 200;
    const ms = (performance.now() - start).toFixed(0);
    const tag = source === 'mock' ? 'mock' : source === 'proxy' ? '  ->' : ' 404';
    console.log(`  ${tag}  ${method.padEnd(6)} ${status} ${fullUrl} ${ms}ms`);

    if ('raw' in handlerResult && handlerResult.raw) {
      sendRaw(res, status, handlerResult.body as string | Buffer, handlerResult.headers as Record<string, string>);
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
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }
      const port = addr.port;
      const url = `http://localhost:${port}`;

      const mockrServer = {
        url,
        port,
        endpoint(urlKey: string) {
          return getEndpointHandle(urlKey);
        },
        use(middleware: Middleware) {
          middlewares.push(middleware);
        },
        async scenario(name: string) {
          applyScenario(name);
        },
        async reset() {
          for (const ep of endpoints) {
            if (ep.isData) ep.handle.reset();
            ep.handle.handler = ep.handlerFn;
          }
        },
        async save(savePath: string) {
          const snapshot: Record<string, unknown> = {};
          for (const ep of endpoints) {
            const key = typeof ep.url === 'string' ? ep.url : ep.url.source;
            if (ep.isData) {
              snapshot[key] = ep.handle.data;
            } else if (ep.isStatic) {
              snapshot[key] = ep.handle.body;
            }
          }
          await writeFile(resolve(savePath), JSON.stringify(snapshot, null, 2), 'utf-8');
        },
        async close() {
          return new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          });
        },
        async setPort(newPort: number) {
          await new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          });
          await new Promise<void>((res, rej) => {
            server.listen(newPort, () => {
              const addr = server.address();
              if (!addr || typeof addr === 'string') {
                rej(new Error('Failed to get server address'));
                return;
              }
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
            const url = typeof ep.url === 'string' ? ep.url : ep.url.source;
            const type = ep.isData ? 'data' as const : ep.isHandler ? 'handler' as const : 'static' as const;
            return {
              url,
              method: ep.method?.toUpperCase() || 'ALL',
              type,
              enabled: !ep.disabled,
              itemCount: ep.isData ? ep.handle.data.length : null,
            };
          });
        },
        enableEndpoint(epUrl: string, method?: string) {
          for (const ep of endpoints) {
            const u = typeof ep.url === 'string' ? ep.url : ep.url.source;
            if (u === epUrl && (!method || ep.method?.toUpperCase() === method.toUpperCase())) {
              ep.disabled = false;
            }
          }
        },
        disableEndpoint(epUrl: string, method?: string) {
          for (const ep of endpoints) {
            const u = typeof ep.url === 'string' ? ep.url : ep.url.source;
            if (u === epUrl && (!method || ep.method?.toUpperCase() === method.toUpperCase())) {
              ep.disabled = true;
            }
          }
        },
        enableAll() {
          for (const ep of endpoints) ep.disabled = false;
        },
        disableAll() {
          for (const ep of endpoints) ep.disabled = true;
        },

        // Proxy control
        enableProxy() {
          proxyEnabled = true;
        },
        disableProxy() {
          proxyEnabled = false;
        },
        setProxyTarget(nameOrUrl: string) {
          if (proxyTargets && nameOrUrl in proxyTargets) {
            proxyTarget = proxyTargets[nameOrUrl];
          } else {
            proxyTarget = nameOrUrl;
          }
          proxyEnabled = true;
        },
        get isProxyEnabled() {
          return proxyEnabled;
        },
        get proxyTarget() {
          return proxyTarget;
        },
        get proxyTargets() {
          return proxyTargets;
        },

        // Scenario info
        listScenarios() {
          return Object.keys(scenarios);
        },
        get activeScenario() {
          return activeScenarioName;
        },

        // TUI
        async tui() {
          const { tui: tuiFn } = await import('./tui.js');
          await tuiFn(mockrServer as unknown as MockrServer);
        },

        // Recorder
        get recorder() {
          if (!recorder) return null;
          const rec = recorder;
          return {
            async startSession(name: string, baseUrl: string) {
              const s = await rec.startSession(name, baseUrl);
              return { id: s.id, name: s.name, baseUrl: s.baseUrl };
            },
            async stopSession(sessionId: string) {
              await rec.stopSession(sessionId);
            },
            async listSessions() {
              const sessions = await rec.listSessions();
              return sessions.map(s => ({
                id: s.id,
                name: s.name,
                baseUrl: s.baseUrl,
                startedAt: s.startedAt,
                stoppedAt: s.stoppedAt,
                entryCount: s.entries.length,
              }));
            },
            async loadSession(sessionId: string) {
              const s = await rec.loadSession(sessionId);
              return {
                id: s.id,
                name: s.name,
                entries: s.entries.map(e => ({
                  url: e.url,
                  method: e.method,
                  status: e.status,
                  size: e.size,
                })),
              };
            },
            async mapToFile(sessionId: string, entryIds: string[], options?: { generateTypes?: boolean }) {
              // Delegate to the /__mockr/map route logic
              const session = await rec.loadSession(sessionId);
              const genTypes = options?.generateTypes !== false;
              const mapped: { url: string; method: string; bodyFile: string; typesFile?: string }[] = [];
              await mkdir(mocksDir, { recursive: true });

              for (const entryId of entryIds) {
                const entry = session.entries.find(e => e.id === entryId);
                if (!entry) continue;
                const parsedUrl = new URL(entry.url, 'http://placeholder');
                const pathname = parsedUrl.pathname;
                const fileName = urlToFileName(pathname);
                const isJson = entry.contentType.includes('json');
                const ext = isJson ? 'json' : 'txt';
                const bodyFilePath = resolve(mocksDir, `${fileName}.${ext}`);
                const bodyContent = await readFile(resolve(rec.sessionsDir, sessionId, 'entries', `${entryId}.body`), 'utf-8');

                if (isJson) {
                  try { await writeFile(bodyFilePath, JSON.stringify(JSON.parse(bodyContent), null, 2), 'utf-8'); }
                  catch { await writeFile(bodyFilePath, bodyContent, 'utf-8'); }
                } else {
                  await writeFile(bodyFilePath, bodyContent, 'utf-8');
                }

                let typesFile: string | undefined;
                if (genTypes && isJson) {
                  try {
                    const typeName = urlToTypeName(pathname);
                    const iface = generateInterface(typeName, JSON.parse(bodyContent));
                    await writeFile(resolve(mocksDir, `${fileName}.d.ts`), iface, 'utf-8');
                    typesFile = `${mocksDir}/${fileName}.d.ts`;
                  } catch { /* skip */ }
                }
                mapped.push({ url: pathname, method: entry.method, bodyFile: `${mocksDir}/${fileName}.${ext}`, typesFile });
              }
              return { mapped };
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
        if (mockedUrls.length) {
          console.log(`  Mocked:`);
          for (const line of mockedUrls) console.log(`    ${line}`);
        }
        if (proxyTarget) {
          console.log(`  Proxy:  ${proxyTarget}`);
        }
        console.log();
      }

      resolvePromise(mockrServer as unknown as MockrServer<TEndpoints>);

      // Auto-launch TUI when explicitly enabled
      // Deferred so user code after `await mockr()` runs first
      if (config.tui && process.stdin.isTTY) {
        setTimeout(() => (mockrServer as any).tui(), 0);
      }
    });

    server.on('error', reject);
  });
}
