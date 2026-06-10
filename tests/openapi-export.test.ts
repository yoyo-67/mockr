import { describe, it, expect, afterEach } from 'vitest';
import { z } from 'zod';
import { mockr } from '../src/index.js';
import { mockGroup } from '../src/mock-group.js';

type E = {
  '/api/projects/:projectId/companies/create/': { id: string };
  '/api/projects/:projectId/companies/': { id: string; name: string }[];
  '/api/config': { theme: string };
};

const open: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (open.length) {
    const s = open.pop()!;
    try { await s.close(); } catch { /* already closed */ }
  }
});

async function getDoc(endpoints: unknown[]): Promise<any> {
  const server = await mockr({ endpoints: endpoints as never });
  open.push(server);
  const res = await fetch(`${server.url}/__mockr/openapi.json`);
  expect(res.status).toBe(200);
  return { doc: await res.json(), serverUrl: server.url };
}

describe('GET /__mockr/openapi.json', () => {
  it('emits a 3.1 doc whose server url is the running mock server', async () => {
    const defs = mockGroup<E>().get('/api/config', () => ({ body: { theme: 'x' } })).done();
    const { doc, serverUrl } = await getDoc(defs);

    expect(doc.openapi).toBe('3.1.0');
    expect(doc.servers).toEqual([{ url: serverUrl }]);
  });

  it('converts :param to {param} and emits required path parameters', async () => {
    const defs = mockGroup<E>()
      .post('/api/projects/:projectId/companies/create/', { fn: () => ({ status: 201, body: { id: '1' } }) })
      .done();
    const { doc } = await getDoc(defs);

    const op = doc.paths['/api/projects/{projectId}/companies/create/']?.post;
    expect(op).toBeDefined();
    expect(op.parameters).toContainEqual({
      name: 'projectId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
    });
  });

  it('expands a list data endpoint to collection + item CRUD paths', async () => {
    const defs = mockGroup<{ '/api/todos': { id: string; title: string }[] }>()
      .data('/api/todos', [{ id: '1', title: 'a' }])
      .done();
    const { doc } = await getDoc(defs);

    expect(Object.keys(doc.paths['/api/todos']).sort()).toEqual(['get', 'post']);
    expect(Object.keys(doc.paths['/api/todos/{id}']).sort()).toEqual(['delete', 'get', 'patch', 'put']);
  });

  it('expands a record data endpoint to verbs at the url with no item path', async () => {
    const defs = mockGroup<{ '/api/config': { theme: string } }>()
      .data('/api/config', { theme: 'dark' })
      .done();
    const { doc } = await getDoc(defs);

    expect(Object.keys(doc.paths['/api/config']).sort()).toEqual(['delete', 'get', 'patch', 'put']);
    expect(doc.paths['/api/config/{id}']).toBeUndefined();
  });

  it("emits a handler's zod body schema as the requestBody JSON schema", async () => {
    const defs = mockGroup<{ '/api/things': { id: string } }>()
      .post('/api/things', { body: z.object({ name: z.string(), count: z.number() }), fn: () => ({ body: { id: '1' } }) })
      .done();
    const { doc } = await getDoc(defs);

    const schema = doc.paths['/api/things'].post.requestBody.content['application/json'].schema;
    expect(schema.type).toBe('object');
    expect(schema.properties).toMatchObject({ name: { type: 'string' }, count: { type: 'number' } });
    expect(schema.required.sort()).toEqual(['count', 'name']);
  });

  it('does not throw when a body schema contains an unrepresentable transform', async () => {
    const defs = mockGroup<{ '/api/coerce': { id: string } }>()
      .post('/api/coerce', {
        body: z.object({ name: z.string(), raw: z.string().transform((s) => s.trim()) }),
        fn: () => ({ body: { id: '1' } }),
      })
      .done();
    const { doc } = await getDoc(defs);

    const op = doc.paths['/api/coerce'].post;
    expect(op).toBeDefined();
    expect(op.requestBody.content['application/json'].schema.type).toBe('object');
  });

  it('emits only the base GET for an un-accessed loader data endpoint (shape unknown)', async () => {
    const defs = mockGroup<{ '/api/lazy': { id: string }[] }>()
      .data('/api/lazy', () => [{ id: '1' }])
      .done();
    const { doc } = await getDoc(defs);

    expect(Object.keys(doc.paths['/api/lazy'])).toEqual(['get']);
    expect(doc.paths['/api/lazy/{id}']).toBeUndefined();
  });
});
