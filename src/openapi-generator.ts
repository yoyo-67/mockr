import type { InternalEndpoint } from './control-routes.js';
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

/** Shape of a `data` endpoint, or `unknown` for an un-accessed loader store. */
function dataShape(ep: InternalEndpoint, recordHandles?: ReadonlyMap<InternalEndpoint, unknown>): 'list' | 'record' | 'unknown' {
  if (ep.listHandle) return 'list';
  if (recordHandles?.has(ep)) return 'record';
  if (Array.isArray(ep.seed)) return 'list';
  if (ep.seed && typeof ep.seed === 'object') return 'record';
  if (ep.partitions) {
    for (const part of ep.partitions.values()) {
      if (part.listHandle) return 'list';
      if (part.recordHandle) return 'record';
    }
  }
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

export function generateOpenApi(endpoints: InternalEndpoint[], opts: GenerateOptions): JsonObject {
  const paths: Record<string, JsonObject> = {};

  const setOp = (oaPath: string, verb: string, params: JsonObject[]): void => {
    const operation: JsonObject = { responses: { '200': { description: 'OK' } } };
    if (params.length) operation.parameters = params;
    paths[oaPath] ??= {};
    paths[oaPath][verb.toLowerCase()] = operation;
  };

  for (const ep of endpoints) {
    if (ep.wsRuntime) continue;
    if (typeof ep.url !== 'string') continue; // RegExp / wildcard urls can't be expressed
    if (ep.url.startsWith('/__mockr/')) continue;

    const oaPath = toOpenApiPath(ep.url);
    const params = pathParameters(ep.url);

    if (ep.isData) {
      const shape = dataShape(ep, opts.recordHandles);
      if (shape === 'unknown') {
        // Un-accessed loader store — list-vs-record not yet knowable. Emit only
        // the safe base GET rather than a misleading synthesized item path.
        setOp(oaPath, 'GET', params);
        continue;
      }
      const matrix: readonly CrudOp[] = shape === 'list' ? LIST_CRUD : RECORD_CRUD;
      const itemPath = oaPath.replace(/\/$/, '') + '/{id}';
      const itemParams = [...params, paramObject('id')];
      for (const op of matrix) {
        if (op.scope === 'item') setOp(itemPath, op.verb, itemParams);
        else setOp(oaPath, op.verb, params);
      }
      continue;
    }

    for (const verb of declaredVerbs(ep)) setOp(oaPath, verb, params);
  }

  return {
    openapi: '3.1.0',
    info: { title: 'mockr', version: '0.0.0' },
    servers: [{ url: opts.serverUrl }],
    paths,
  };
}
