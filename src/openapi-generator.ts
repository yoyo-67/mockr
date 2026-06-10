import type { InternalEndpoint } from './control-routes.js';
import type { ParseableSchema } from './types.js';
import { LIST_CRUD, RECORD_CRUD, type CrudOp } from './crud-matrix.js';

/**
 * Generates an OpenAPI 3.1 document from the live endpoint registry, mirroring
 * the surface mockr actually serves. Read-only — the standalone-tool escape
 * hatch (`GET /__mockr/openapi.json`) for importing routes into Postman/etc.
 * See CONTEXT.md.
 */

interface GenerateOptions {
  serverUrl: string;
  /** Used to detect record-shaped (`data: T` object) endpoints. */
  recordHandles?: ReadonlyMap<InternalEndpoint, unknown>;
}

type JsonObject = Record<string, unknown>;

const BODY_VERBS = new Set(['POST', 'PUT', 'PATCH']);

const STATUS_DESC: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  404: 'Not Found',
};

/** `:name` path segments → OpenAPI `{name}`. */
function toOpenApiPath(url: string): string {
  return url.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/** Param names declared in a `:name` URL pattern. */
function pathParamNames(url: string): string[] {
  return (url.match(/:([A-Za-z0-9_]+)/g) || []).map((s) => s.slice(1));
}

function paramObject(name: string): JsonObject {
  return { name, in: 'path', required: true, schema: { type: 'string' } };
}

function pathParameters(url: string): JsonObject[] {
  return pathParamNames(url).map(paramObject);
}

/**
 * Duck-typed JSON-Schema conversion: zod 4 schemas expose `.toJSONSchema()`.
 * Anything without it (zod 3, non-zod validators) yields `null` → generic body.
 */
function jsonSchemaOf(schema: ParseableSchema | undefined): JsonObject | null {
  const maybe = schema as unknown as { toJSONSchema?: (opts?: unknown) => JsonObject } | undefined;
  if (!maybe || typeof maybe.toJSONSchema !== 'function') return null;
  try {
    // `unrepresentable: 'any'` keeps representable fields and degrades the rest
    // (transforms, coerce, custom refinements) to `{}` instead of throwing.
    const js = maybe.toJSONSchema({ unrepresentable: 'any' });
    delete (js as { $schema?: unknown }).$schema;
    return js;
  } catch {
    // Some schema shapes still can't convert — fall back to a generic body.
    return null;
  }
}

/** Best-effort query parameters from a query schema's top-level properties. */
function queryParameters(querySchema: ParseableSchema | undefined): JsonObject[] {
  const js = jsonSchemaOf(querySchema);
  const props = js?.properties as Record<string, JsonObject> | undefined;
  if (!props) return [];
  const required = new Set((js?.required as string[] | undefined) ?? []);
  return Object.entries(props).map(([name, schema]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema,
  }));
}

/** Whether a loader endpoint has run (real shape known); the builder seeds a
 *  meaningless `data: []` placeholder, so an unhydrated loader's shape is
 *  genuinely unknown. */
function loaderHydrated(ep: InternalEndpoint): boolean {
  if (ep.hydrated) return true;
  if (ep.partitions) {
    for (const part of ep.partitions.values()) if (part.hydrated) return true;
  }
  return false;
}

/** Shape of a `data` endpoint, or `unknown` for an un-accessed loader store. */
function dataShape(ep: InternalEndpoint, recordHandles?: ReadonlyMap<InternalEndpoint, unknown>): 'list' | 'record' | 'unknown' {
  // A loader determines the real shape only once it runs — ignore the `data: []`
  // placeholder the builder leaves behind on `listHandle`/`seed`.
  if (ep.load && !loaderHydrated(ep)) return 'unknown';
  if (ep.partitions) {
    for (const part of ep.partitions.values()) {
      if (part.listHandle) return 'list';
      if (part.recordHandle) return 'record';
    }
  }
  if (ep.listHandle) return 'list';
  if (recordHandles?.has(ep)) return 'record';
  if (Array.isArray(ep.seed)) return 'list';
  if (ep.seed && typeof ep.seed === 'object') return 'record';
  if (Array.isArray(ep.staticBody)) return 'list';
  if (ep.staticBody && typeof ep.staticBody === 'object') return 'record';
  return 'unknown';
}

/** The declared verbs a handler / methods / static endpoint serves. */
function declaredVerbs(ep: InternalEndpoint): string[] {
  if (ep.methods) return Object.keys(ep.methods).map((v) => v.toUpperCase());
  if (ep.isHandler && ep.method) return [ep.method.toUpperCase()];
  if (ep.isStatic) return [(ep.method || 'GET').toUpperCase()];
  return [];
}

/** Schemas (body/query) declared for a given verb on an endpoint. */
function schemasFor(ep: InternalEndpoint, verb: string): { body?: ParseableSchema; query?: ParseableSchema } {
  if (ep.methods) {
    const spec = ep.methods[verb] as { body?: ParseableSchema; query?: ParseableSchema } | undefined;
    return { body: spec?.body, query: spec?.query };
  }
  if (ep.isHandler && ep.method?.toUpperCase() === verb) {
    return { body: ep.schemas?.body, query: ep.schemas?.query };
  }
  return {};
}

export function generateOpenApi(endpoints: InternalEndpoint[], opts: GenerateOptions): JsonObject {
  const paths: Record<string, JsonObject> = {};

  const setOp = (oaPath: string, verb: string, params: JsonObject[], schemas: { body?: ParseableSchema; query?: ParseableSchema }, statuses: number[] = [200]): void => {
    const operation: JsonObject = {};
    const allParams = [...params, ...queryParameters(schemas.query)];
    if (allParams.length) operation.parameters = allParams;
    if (BODY_VERBS.has(verb)) {
      const schema = jsonSchemaOf(schemas.body) ?? { type: 'object' };
      operation.requestBody = { content: { 'application/json': { schema } } };
    }
    const responses: JsonObject = {};
    for (const s of statuses) responses[String(s)] = { description: STATUS_DESC[s] ?? 'Response' };
    operation.responses = responses;
    paths[oaPath] ??= {};
    paths[oaPath][verb.toLowerCase()] = operation;
  };

  for (const ep of endpoints) {
    if (ep.disabled) continue; // disabled endpoints fall through to proxy — not served by mockr
    if (ep.wsRuntime) continue;
    if (typeof ep.url !== 'string') continue; // RegExp urls can't be expressed as a path
    if (ep.url.startsWith('/__mockr/')) continue;
    if (ep.url.includes('*')) continue; // wildcard urls can't be expressed as a path

    const oaPath = toOpenApiPath(ep.url);
    const params = pathParameters(ep.url);

    if (ep.isData) {
      const shape = dataShape(ep, opts.recordHandles);
      if (shape === 'unknown') {
        // Un-accessed loader store — list-vs-record not yet knowable. Emit only
        // the safe base GET rather than a misleading synthesized item path.
        setOp(oaPath, 'GET', params, {});
        continue;
      }
      const matrix: readonly CrudOp[] = shape === 'list' ? LIST_CRUD : RECORD_CRUD;
      const itemPath = oaPath.replace(/\/$/, '') + '/{id}';
      const itemParams = [...params, paramObject('id')];
      for (const op of matrix) {
        // default CRUD doesn't validate bodies — mutation verbs get a generic body.
        // Item ops address a specific `{id}` that may not exist → also document 404.
        if (op.scope === 'item') setOp(itemPath, op.verb, itemParams, {}, [op.status, 404]);
        else setOp(oaPath, op.verb, params, {}, [op.status]);
      }
      continue;
    }

    for (const verb of declaredVerbs(ep)) setOp(oaPath, verb, params, schemasFor(ep, verb));
  }

  return {
    openapi: '3.1.0',
    info: { title: 'mockr', version: '0.0.0' },
    servers: [{ url: opts.serverUrl }],
    paths,
  };
}
