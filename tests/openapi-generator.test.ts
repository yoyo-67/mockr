import { describe, it, expect } from 'vitest';
import { generateOpenApi } from '../src/openapi-generator.js';
import type { InternalEndpoint } from '../src/control-routes.js';

/** Minimal InternalEndpoint with sane defaults — override what each test needs. */
function ep(over: Partial<InternalEndpoint>): InternalEndpoint {
  return {
    url: '/api/x',
    matcher: () => null,
    listHandle: null,
    staticBody: undefined,
    staticResponse: { status: 200, headers: {}, body: undefined },
    activeHandler: null,
    idKey: 'id',
    isData: false,
    isHandler: false,
    isStatic: false,
    disabled: false,
    handlerFn: null,
    schemas: null,
    ...over,
  } as InternalEndpoint;
}

function gen(endpoints: InternalEndpoint[]) {
  return generateOpenApi(endpoints, { serverUrl: 'http://localhost:4000' }) as {
    paths: Record<string, Record<string, any>>;
  };
}

/** Fake validator exposing zod-4's `.toJSONSchema()` duck-type. */
function fakeSchema(js: object): any {
  return { safeParse: () => ({ success: true, data: {} }), toJSONSchema: () => ({ $schema: 'x', ...js }) };
}

describe('generateOpenApi — edge cases', () => {
  it('skips RegExp-url endpoints (cannot be expressed as a path)', () => {
    const doc = gen([ep({ url: /^\/api\/.*$/ as unknown as string, isHandler: true, method: 'GET' })]);
    expect(Object.keys(doc.paths)).toHaveLength(0);
  });

  it('skips wildcard-url endpoints', () => {
    const doc = gen([ep({ url: '/api/files/*', isHandler: true, method: 'GET' })]);
    expect(doc.paths['/api/files/*']).toBeUndefined();
  });

  it('skips /__mockr/* control routes', () => {
    const doc = gen([ep({ url: '/__mockr/endpoints', isHandler: true, method: 'GET' })]);
    expect(Object.keys(doc.paths)).toHaveLength(0);
  });

  it('skips WebSocket endpoints', () => {
    const doc = gen([ep({ url: '/ws', wsRuntime: {} as InternalEndpoint['wsRuntime'] })]);
    expect(Object.keys(doc.paths)).toHaveLength(0);
  });

  it('skips disabled endpoints (not served — fall through to proxy)', () => {
    const doc = gen([ep({ url: '/api/off', isHandler: true, method: 'GET', disabled: true })]);
    expect(Object.keys(doc.paths)).toHaveLength(0);
  });

  it('emits every verb of a methods-map endpoint at one path', () => {
    const doc = gen([ep({
      url: '/api/cart',
      methods: { GET: {} as never, POST: {} as never, DELETE: {} as never },
    })]);
    expect(Object.keys(doc.paths['/api/cart']).sort()).toEqual(['delete', 'get', 'post']);
  });

  it('omits parameters entirely when there are no path/query params', () => {
    const doc = gen([ep({ url: '/api/ping', isHandler: true, method: 'GET' })]);
    expect(doc.paths['/api/ping'].get.parameters).toBeUndefined();
  });

  it('emits one required path parameter per :segment (multiple params)', () => {
    const doc = gen([ep({ url: '/api/:org/users/:userId', isHandler: true, method: 'GET' })]);
    const names = doc.paths['/api/{org}/users/{userId}'].get.parameters.map((p: any) => p.name);
    expect(names).toEqual(['org', 'userId']);
  });

  it('emits GET for a static endpoint', () => {
    const doc = gen([ep({ url: '/api/version', isStatic: true })]);
    expect(Object.keys(doc.paths['/api/version'])).toEqual(['get']);
  });

  it('gives a handler POST without a body schema a generic object body', () => {
    const doc = gen([ep({ url: '/api/submit', isHandler: true, method: 'POST' })]);
    expect(doc.paths['/api/submit'].post.requestBody.content['application/json'].schema).toEqual({ type: 'object' });
  });

  it('strips the $schema key from a converted body schema', () => {
    const doc = gen([ep({
      url: '/api/things',
      isHandler: true,
      method: 'POST',
      schemas: { body: fakeSchema({ type: 'object', properties: { a: { type: 'string' } } }) },
    })]);
    const schema = doc.paths['/api/things'].post.requestBody.content['application/json'].schema;
    expect(schema.$schema).toBeUndefined();
    expect(schema.properties).toEqual({ a: { type: 'string' } });
  });

  it('expands a query schema into query parameters', () => {
    const doc = gen([ep({
      url: '/api/search',
      isHandler: true,
      method: 'GET',
      schemas: { query: fakeSchema({ type: 'object', properties: { q: { type: 'string' }, page: { type: 'number' } }, required: ['q'] }) },
    })]);
    const params = doc.paths['/api/search'].get.parameters;
    expect(params).toContainEqual({ name: 'q', in: 'query', required: true, schema: { type: 'string' } });
    expect(params).toContainEqual({ name: 'page', in: 'query', required: false, schema: { type: 'number' } });
  });

  it('normalizes a trailing slash when building the list item path', () => {
    const doc = gen([ep({ url: '/api/todos/', isData: true, listHandle: { data: [] } as never })]);
    expect(doc.paths['/api/todos/{id}']).toBeDefined();
    expect(doc.paths['/api/todos//{id}']).toBeUndefined();
  });

  it('treats an unhydrated loader as unknown shape even with a placeholder list handle', () => {
    const doc = gen([ep({
      url: '/api/lazy',
      isData: true,
      load: () => [],
      hydrated: false,
      listHandle: { data: [] } as never, // builder placeholder — must be ignored
    })]);
    expect(Object.keys(doc.paths['/api/lazy'])).toEqual(['get']);
  });
});
