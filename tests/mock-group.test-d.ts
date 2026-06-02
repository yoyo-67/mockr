import { describe, it, expectTypeOf } from 'vitest';
import { z } from 'zod';
import { mockGroup, type PathParams } from '../src/mock-group.js';
import { mockr } from '../src/server.js';
import type { EndpointDef } from '../src/types.js';

interface Todo {
  id: number;
  title: string;
}

type E = {
  '/api/todos': Todo[];
  '/api/todos/:id': Todo;
  '/internal/todos': Todo[];
};

describe('mockGroup builder types', () => {
  it('constrains url to keyof E', () => {
    const mock = mockGroup<E>();
    mock.get('/api/todos', () => ({ body: [] }));
    // @ts-expect-error — '/nope' is not a key of E
    mock.get('/nope', () => ({ body: [] }));
  });

  it('checks the response body against the url type (array map → element[])', () => {
    const mock = mockGroup<E>();
    mock.get('/api/todos', () => ({ body: [{ id: 1, title: 'a' }] }));
    // @ts-expect-error — { weight }[] is not assignable to Todo[]
    mock.get('/api/todos', () => ({ body: [{ weight: 1 }] }));
  });

  it('checks the response body for a record (non-array) url', () => {
    const mock = mockGroup<E>();
    mock.get('/api/todos/:id', () => ({ body: { id: 1, title: 'a' } }));
    // @ts-expect-error — missing title; not a Todo
    mock.get('/api/todos/:id', () => ({ body: { id: 1 } }));
  });

  it('infers req.params from the :name pattern', () => {
    const mock = mockGroup<E>();
    mock.get('/api/todos/:id', (req) => {
      expectTypeOf(req.params).toEqualTypeOf<{ id: string }>();
      return { body: { id: 1, title: 'a' } };
    });
  });

  it('infers req.body from a body schema', () => {
    const mock = mockGroup<E>();
    mock.post('/api/todos', {
      body: z.object({ title: z.string() }),
      fn: (req) => {
        expectTypeOf(req.body.title).toEqualTypeOf<string>();
        return { body: [] };
      },
    });
  });

  it('types ctx.endpoint against the whole map (cross-endpoint store)', () => {
    const mock = mockGroup<E>();
    mock.get('/api/todos', (_req, ctx) => {
      const handle = ctx.endpoint('/internal/todos');
      expectTypeOf(handle.data).toEqualTypeOf<Todo[]>();
      return { body: handle.data };
    });
  });

  it('types data() seed and constrains its url', () => {
    const mock = mockGroup<E>();
    mock.data('/internal/todos', [{ id: 1, title: 'a' }]);
    // @ts-expect-error — Other[] is not assignable to Todo[]
    mock.data('/internal/todos', [{ weight: 1 }]);
    // @ts-expect-error — '/nope' is not a key of E
    mock.data('/nope', []);
  });

  it('done() returns EndpointDef<E>[]', () => {
    const defs = mockGroup<E>().get('/api/todos', () => ({ body: [] })).done();
    expectTypeOf(defs).toExtend<EndpointDef<E>[]>();
  });
});

describe('mockGroup — direct body return types', () => {
  it('accepts a bare body matching the url type', () => {
    const mock = mockGroup<E>();
    mock.get('/api/todos', () => [{ id: 1, title: 'a' }]);
    mock.get('/api/todos/:id', () => ({ id: 1, title: 'a' }));
  });

  it('rejects a bare body of the wrong shape', () => {
    const mock = mockGroup<E>();
    // @ts-expect-error — { weight }[] is not assignable to Todo[]
    mock.get('/api/todos', () => [{ weight: 1 }]);
  });

  it('still accepts the { body, status } form', () => {
    const mock = mockGroup<E>();
    mock.post('/api/todos', () => ({ status: 201, body: [{ id: 1, title: 'a' }] }));
  });
});

describe('mockGroup — ctx shorthands types', () => {
  it('accepts ctx.error / created / noContent as handler returns', () => {
    const mock = mockGroup<E>();
    mock.get('/api/todos/:id', (_req, ctx) => ctx.error(404, 'x'));
    mock.post('/api/todos', (_req, ctx) => ctx.created([{ id: 1, title: 'a' }]));
    mock.delete('/api/todos/:id', (_req, ctx) => ctx.noContent());
  });
});

describe('mockGroup — responseSchema + verify config types', () => {
  it('accepts responseSchema on a verb spec and verify/onDrift on config', () => {
    const defs = mockGroup<E>()
      .get('/api/todos', { responseSchema: z.object({ id: z.number(), title: z.string() }).array(), fn: () => [] })
      .done();
    void mockr<E>({
      verify: true,
      onDrift: (info) => {
        expectTypeOf(info.url).toEqualTypeOf<string>();
        expectTypeOf(info.method).toEqualTypeOf<string>();
      },
      endpoints: defs,
    });
  });
});

describe('mockGroup — scenario preset types', () => {
  it('accepts presets typed against the url body (fn or static)', () => {
    const mock = mockGroup<E>();
    mock.get('/api/todos', { scenarios: { empty: () => [], one: [{ id: 1, title: 'a' }] }, fn: () => [] });
  });

  it('rejects a preset body of the wrong shape', () => {
    const mock = mockGroup<E>();
    // @ts-expect-error — { weight }[] is not a Todo[]
    mock.get('/api/todos', { scenarios: { bad: [{ weight: 1 }] }, fn: () => [] });
  });
});

describe('mockr({ groups }) types', () => {
  it('accepts arrays of EndpointDef<E> as groups under one shared map', () => {
    const a = mockGroup<E>().get('/api/todos', () => []).done();
    const b = mockGroup<E>().data('/internal/todos', []).done();
    void mockr<E>({ groups: [a, b] });
  });
});

describe('mockGroup — prefix types', () => {
  it('constrains the sub-path so prefix + sub is a key of E', () => {
    const mock = mockGroup<E>().prefix('/api');
    mock.get('/todos', () => [{ id: 1, title: 'a' }]);
    mock.get('/todos/:id', () => ({ id: 1, title: 'a' }));
    // @ts-expect-error — '/api/nope' is not a key of E
    mock.get('/nope', () => []);
  });

  it('infers params and body from the full prefixed url', () => {
    const mock = mockGroup<E>().prefix('/api');
    mock.get('/todos/:id', (req) => {
      expectTypeOf(req.params).toEqualTypeOf<{ id: string }>();
      return { id: 1, title: 'a' };
    });
    // @ts-expect-error — { weight }[] is not assignable to Todo[]
    mock.get('/todos', () => [{ weight: 1 }]);
  });
});

describe('PathParams', () => {
  it('extracts a single param', () => {
    expectTypeOf<PathParams<'/api/todos/:id'>>().toEqualTypeOf<{ id: string }>();
  });

  it('extracts multiple params', () => {
    const p = {} as PathParams<'/p/:projectId/u/:userId/'>;
    expectTypeOf(p.projectId).toEqualTypeOf<string>();
    expectTypeOf(p.userId).toEqualTypeOf<string>();
    // @ts-expect-error — not a captured param
    p.nope;
  });

  it('captures nothing from wildcard segments', () => {
    expectTypeOf<PathParams<'/api/groups/*/projects/'>>().toEqualTypeOf<{}>();
  });
});
