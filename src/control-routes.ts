import type { ServerResponse } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import type { Recorder } from './recorder.js';
import type { MatchFn } from './router.js';
import type { MockrRequest, HandlerResult, HandlerContext, ParseableSchema, EndpointHandle } from './types.js';
import { createEndpointHandle } from './endpoint-handle.js';
import { createMatcher } from './router.js';
import { generateInterface, urlToFileName, urlToTypeName } from './type-generator.js';
import { sendCorsJson, handleCorsOptions } from './http-utils.js';
import { addEndpointToServerFile, removeEndpointFromServerFile, updateUrlInServerFile, changeToHandlerInServerFile } from './server-file-patcher.js';

export interface InternalEndpoint {
  url: string | RegExp;
  method?: string;
  matcher: MatchFn;
  handle: EndpointHandle<unknown>;
  idKey: string;
  isData: boolean;
  isHandler: boolean;
  isStatic: boolean;
  disabled: boolean;
  handlerFn: ((req: MockrRequest, ctx: HandlerContext<any>) => HandlerResult | Promise<HandlerResult>) | null;
  schemas: { body?: ParseableSchema; query?: ParseableSchema; params?: ParseableSchema } | null;
  filePath?: string;
}

interface ControlRoutesConfig {
  recorder: Recorder | null;
  endpoints: InternalEndpoint[];
  mocksDir: string;
  serverFile: string | null;
  scenarios: Record<string, unknown>;
}

/**
 * Handles all `/__mockr/*` control routes. Returns true if the route was handled.
 */
export async function handleControlRoute(
  path: string,
  method: string,
  body: unknown,
  res: ServerResponse,
  config: ControlRoutesConfig,
): Promise<boolean> {
  const { recorder, endpoints, mocksDir, serverFile, scenarios } = config;

  // Scenario switching
  if (path === '/__mockr/scenario' && method === 'POST') {
    return false; // handled separately in server.ts
  }

  if (!path.startsWith('/__mockr/')) return false;

  if (method === 'OPTIONS') {
    handleCorsOptions(res);
    return true;
  }

  if (!recorder) {
    sendCorsJson(res, 400, { error: 'Recorder not enabled. Use --recorder flag or recorder config option.' });
    return true;
  }

  // POST /__mockr/record/start
  if (path === '/__mockr/record/start' && method === 'POST') {
    const reqBody = body as { name?: string; baseUrl?: string } | undefined;
    const name = reqBody?.name || `session-${Date.now()}`;
    const baseUrl = reqBody?.baseUrl || '';
    const session = await recorder.startSession(name, baseUrl);
    sendCorsJson(res, 200, { sessionId: session.id, name: session.name, baseUrl: session.baseUrl });
    return true;
  }

  // POST /__mockr/record
  if (path === '/__mockr/record' && method === 'POST') {
    const reqBody = body as any;
    if (!reqBody?.sessionId) { sendCorsJson(res, 400, { error: 'sessionId required' }); return true; }
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
    sendCorsJson(res, 200, entry);
    return true;
  }

  // POST /__mockr/record/stop
  if (path === '/__mockr/record/stop' && method === 'POST') {
    const reqBody = body as { sessionId?: string } | undefined;
    if (!reqBody?.sessionId) { sendCorsJson(res, 400, { error: 'sessionId required' }); return true; }
    const session = await recorder.stopSession(reqBody.sessionId);
    sendCorsJson(res, 200, { id: session.id, name: session.name, entryCount: session.entries.length });
    return true;
  }

  // GET /__mockr/sessions
  if (path === '/__mockr/sessions' && method === 'GET') {
    const sessions = await recorder.listSessions();
    sendCorsJson(res, 200, sessions.map(s => ({
      id: s.id, name: s.name, baseUrl: s.baseUrl,
      startedAt: s.startedAt, stoppedAt: s.stoppedAt, entryCount: s.entries.length,
    })));
    return true;
  }

  // GET/DELETE /__mockr/sessions/:id
  if (path.startsWith('/__mockr/sessions/')) {
    const sessionId = path.slice('/__mockr/sessions/'.length);
    if (method === 'GET') {
      try {
        const session = await recorder.loadSession(sessionId);
        sendCorsJson(res, 200, session);
      } catch {
        sendCorsJson(res, 404, { error: 'Session not found' });
      }
      return true;
    }
    if (method === 'DELETE') {
      await recorder.deleteSession(sessionId);
      sendCorsJson(res, 200, { deleted: true });
      return true;
    }
  }

  // POST /__mockr/map
  if (path === '/__mockr/map' && method === 'POST') {
    await handleMap(body, res, recorder, endpoints, mocksDir, serverFile);
    return true;
  }

  // GET /__mockr/endpoints
  if (path === '/__mockr/endpoints' && method === 'GET') {
    const list = endpoints.map(ep => ({
      url: typeof ep.url === 'string' ? ep.url : ep.url.source,
      method: ep.method?.toUpperCase() || 'ALL',
      type: ep.isData ? 'data' : ep.isHandler ? 'handler' : 'static',
      enabled: !ep.disabled,
      itemCount: ep.isData ? (ep.handle.data as unknown[]).length : null,
      filePath: ep.filePath || null,
    }));
    sendCorsJson(res, 200, list);
    return true;
  }

  // DELETE /__mockr/endpoints
  if (path === '/__mockr/endpoints' && method === 'DELETE') {
    const reqBody = body as { url: string; method?: string } | undefined;
    if (!reqBody?.url) { sendCorsJson(res, 400, { error: 'url required' }); return true; }

    const idx = endpoints.findIndex(ep => {
      const epUrl = typeof ep.url === 'string' ? ep.url : ep.url.source;
      return epUrl === reqBody.url && (!reqBody.method || (ep.method || 'ALL').toUpperCase() === reqBody.method.toUpperCase());
    });

    if (idx === -1) { sendCorsJson(res, 404, { error: 'Endpoint not found' }); return true; }
    const removed = endpoints.splice(idx, 1)[0];

    // Delete the mock file from disk
    if (removed.filePath) {
      try {
        const { unlink } = await import('node:fs/promises');
        await unlink(removed.filePath);
        // Also delete .d.ts if it exists
        const dtsPath = removed.filePath.replace(/\.(json|txt)$/, '.d.ts');
        await unlink(dtsPath).catch(() => {});
      } catch { /* file may not exist */ }
    }

    if (serverFile) {
      try { await removeEndpointFromServerFile(serverFile, reqBody.url); }
      catch (err) { console.error('[mockr] Failed to update server file:', err); }
    }
    sendCorsJson(res, 200, { deleted: reqBody.url });
    return true;
  }

  // PATCH /__mockr/endpoints
  if (path === '/__mockr/endpoints' && method === 'PATCH') {
    const reqBody = body as { oldUrl: string; newUrl: string; method?: string } | undefined;
    if (!reqBody?.oldUrl || !reqBody?.newUrl) { sendCorsJson(res, 400, { error: 'oldUrl and newUrl required' }); return true; }

    let updated = false;
    for (const ep of endpoints) {
      const epUrl = typeof ep.url === 'string' ? ep.url : null;
      if (epUrl === reqBody.oldUrl && (!reqBody.method || (ep.method || 'ALL').toUpperCase() === reqBody.method.toUpperCase())) {
        ep.url = reqBody.newUrl;
        ep.matcher = createMatcher(reqBody.newUrl);
        updated = true;
        if (serverFile) {
          try { await updateUrlInServerFile(serverFile, reqBody.oldUrl, reqBody.newUrl); }
          catch (err) { console.error('[mockr] Failed to update server file:', err); }
        }
        break;
      }
    }
    if (!updated) { sendCorsJson(res, 404, { error: 'Endpoint not found' }); return true; }
    sendCorsJson(res, 200, { url: reqBody.newUrl, method: reqBody.method || 'ALL' });
    return true;
  }

  // PATCH /__mockr/endpoints/type
  if (path === '/__mockr/endpoints/type' && method === 'PATCH') {
    const reqBody = body as { url: string; type: string; method?: string } | undefined;
    if (!reqBody?.url || !reqBody?.type) { sendCorsJson(res, 400, { error: 'url and type required' }); return true; }

    let updated = false;
    for (const ep of endpoints) {
      const epUrl = typeof ep.url === 'string' ? ep.url : null;
      if (epUrl !== reqBody.url) continue;
      if (reqBody.method && (ep.method || 'ALL').toUpperCase() !== reqBody.method.toUpperCase()) continue;

      if (reqBody.type === 'handler' && ep.isStatic) {
        const currentBody = ep.handle.body;
        const handlerFn: InternalEndpoint['handlerFn'] = async () => ({ status: 200, body: ep.handle.body ?? currentBody });
        ep.isStatic = false;
        ep.isHandler = true;
        ep.handlerFn = handlerFn;
        ep.handle.handler = handlerFn;
        updated = true;
        if (serverFile) {
          try { await changeToHandlerInServerFile(serverFile, reqBody.url); }
          catch (err) { console.error('[mockr] Failed to update server file:', err); }
        }
      } else if (reqBody.type === 'static' && ep.isHandler) {
        ep.isHandler = false;
        ep.isStatic = true;
        ep.handlerFn = null;
        ep.handle.handler = null;
        ep.handle.response = { status: 200, headers: {}, body: ep.handle.body };
        updated = true;
      } else if (reqBody.type === 'data') {
        ep.isHandler = false;
        ep.isStatic = false;
        ep.isData = true;
        ep.handlerFn = null;
        ep.handle.handler = null;
        const b = ep.handle.body;
        if ((!Array.isArray(ep.handle.data) || ep.handle.data.length === 0) && Array.isArray(b)) ep.handle.data = b;
        updated = true;
      }
      break;
    }
    if (!updated) { sendCorsJson(res, 404, { error: 'Endpoint not found or type unchanged' }); return true; }
    sendCorsJson(res, 200, { url: reqBody.url, type: reqBody.type });
    return true;
  }

  // POST /__mockr/endpoints/toggle
  if (path === '/__mockr/endpoints/toggle' && method === 'POST') {
    const reqBody = body as { url: string; method?: string; enabled: boolean } | undefined;
    if (!reqBody?.url || reqBody.enabled === undefined) { sendCorsJson(res, 400, { error: 'url and enabled required' }); return true; }
    for (const ep of endpoints) {
      const epUrl = typeof ep.url === 'string' ? ep.url : ep.url.source;
      if (epUrl === reqBody.url && (!reqBody.method || (ep.method || 'ALL').toUpperCase() === reqBody.method.toUpperCase())) {
        ep.disabled = !reqBody.enabled;
      }
    }
    sendCorsJson(res, 200, { url: reqBody.url, enabled: reqBody.enabled });
    return true;
  }

  // GET /__mockr/map/endpoints
  if (path === '/__mockr/map/endpoints' && method === 'GET') {
    const mapped = endpoints
      .filter(ep => typeof ep.url === 'string' && (ep.isStatic || ep.isHandler))
      .map(ep => ({ url: typeof ep.url === 'string' ? ep.url : '', method: ep.method?.toUpperCase() || 'ALL', enabled: !ep.disabled }));
    sendCorsJson(res, 200, mapped);
    return true;
  }

  // Catch-all
  sendCorsJson(res, 404, { error: `Unknown recorder route: ${method} ${path}` });
  return true;
}

async function handleMap(
  body: unknown,
  res: ServerResponse,
  recorder: Recorder,
  endpoints: InternalEndpoint[],
  mocksDir: string,
  serverFile: string | null,
) {
  const reqBody = body as {
    entries?: { url: string; method: string; status: number; contentType: string; body: string }[];
    sessionId?: string;
    entryIds?: string[];
    generateTypes?: boolean;
  } | undefined;

  type MapEntry = { url: string; method: string; status: number; contentType: string; body: string };
  const entriesToMap: MapEntry[] = [];

  if (reqBody?.entries?.length) {
    entriesToMap.push(...reqBody.entries);
  } else if (reqBody?.sessionId && reqBody?.entryIds?.length) {
    const session = await recorder.loadSession(reqBody.sessionId);
    for (const entryId of reqBody.entryIds) {
      const entry = session.entries.find(e => e.id === entryId);
      if (!entry) continue;
      const bodyContent = await readFile(resolve(recorder.sessionsDir, reqBody.sessionId, 'entries', `${entryId}.body`), 'utf-8');
      entriesToMap.push({ url: entry.url, method: entry.method, status: entry.status, contentType: entry.contentType, body: bodyContent });
    }
  } else {
    sendCorsJson(res, 400, { error: 'entries[] or sessionId+entryIds required' });
    return;
  }

  const generateTypes = reqBody?.generateTypes !== false;
  const mapped: { url: string; method: string; bodyFile: string; typesFile?: string }[] = [];

  await mkdir(mocksDir, { recursive: true });

  for (const entry of entriesToMap) {
    const parsedUrl = new URL(entry.url, 'http://placeholder');
    const pathname = parsedUrl.pathname;
    const fileName = urlToFileName(pathname);
    const isJson = entry.contentType.includes('json');
    const ext = isJson ? 'json' : 'txt';
    const bodyFilePath = resolve(mocksDir, `${fileName}.${ext}`);
    const bodyFileRelative = './' + relative(process.cwd(), bodyFilePath);
    const bodyContent = entry.body;

    // Write file
    if (isJson) {
      try { await writeFile(bodyFilePath, JSON.stringify(JSON.parse(bodyContent), null, 2), 'utf-8'); }
      catch { await writeFile(bodyFilePath, bodyContent, 'utf-8'); }
    } else {
      await writeFile(bodyFilePath, bodyContent, 'utf-8');
    }

    // Generate TypeScript interface
    let typesFile: string | undefined;
    let typesAbsPath: string | undefined;
    if (generateTypes && isJson) {
      try {
        const typeName = urlToTypeName(pathname);
        const iface = generateInterface(typeName, JSON.parse(bodyContent));
        typesAbsPath = resolve(mocksDir, `${fileName}.d.ts`);
        await writeFile(typesAbsPath, iface, 'utf-8');
        typesFile = './' + relative(process.cwd(), typesAbsPath);
      } catch { /* skip */ }
    }

    // Create/update in-memory endpoint — data endpoint if array, static otherwise
    const epMethod = entry.method.toUpperCase();
    const bodyData = isJson ? JSON.parse(bodyContent) : bodyContent;
    const isArray = Array.isArray(bodyData);

    let found = false;
    for (const ep of endpoints) {
      const epUrl = typeof ep.url === 'string' ? ep.url : null;
      if (epUrl === pathname && (!ep.method || ep.method.toUpperCase() === epMethod)) {
        if (isArray) {
          ep.handle.data = bodyData;
          ep.isData = true;
          ep.isStatic = false;
          ep.isHandler = false;
          ep.handlerFn = null;
          ep.handle.handler = null;
        } else {
          ep.handle.body = bodyData;
          ep.handle.response = { status: entry.status === 304 ? 200 : entry.status, headers: {}, body: bodyData };
          ep.isStatic = true;
          ep.isData = false;
          ep.isHandler = false;
        }
        found = true;
        break;
      }
    }

    if (!found) {
      if (isArray) {
        const handle = createEndpointHandle(bodyData, pathname);
        endpoints.push({
          url: pathname,
          method: epMethod === 'GET' ? undefined : epMethod,
          matcher: createMatcher(pathname),
          handle,
          idKey: 'id',
          isData: true,
          isHandler: false,
          isStatic: false,
          handlerFn: null,
          schemas: null,
          disabled: false,
          filePath: bodyFilePath,
        });
      } else {
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
          filePath: bodyFilePath,
        });
      }
    }

    // Patch server file
    if (serverFile) {
      try { await addEndpointToServerFile(serverFile, { url: pathname, method: epMethod, filePath: bodyFileRelative, typesFile: typesAbsPath }); }
      catch (err) { console.error('[mockr] Failed to patch server file:', err); }
    }

    mapped.push({ url: pathname, method: epMethod, bodyFile: bodyFileRelative, typesFile });
  }

  sendCorsJson(res, 200, { mapped });
}
