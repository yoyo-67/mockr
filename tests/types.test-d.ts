import { describe, it, expectTypeOf } from 'vitest';
import { mockr, handler, type EndpointHandle, type EndpointInfo, type MockrRequest, type MockrServer } from '../src/index.js';
import { z } from 'zod';

interface Item {
  id: number;
  name: string;
  price: number;
}

interface Config {
  theme: string;
  lang: string;
}

type MyEndpoints = {
  '/api/items': Item;
  '/api/config': Config;
};

describe('Type inference', () => {
  it('endpoint handle is typed', () => {
    const handle = {} as EndpointHandle<Item>;

    expectTypeOf(handle.data).toEqualTypeOf<Item[]>();
    expectTypeOf(handle.findById(1)).toEqualTypeOf<Item | undefined>();
    expectTypeOf(handle.where({ price: 1 })).toEqualTypeOf<Item[]>();
    expectTypeOf(handle.first()).toEqualTypeOf<Item | undefined>();
    expectTypeOf(handle.count()).toEqualTypeOf<number>();
    expectTypeOf(handle.has(1)).toEqualTypeOf<boolean>();
  });

  it('insert accepts full item', () => {
    const handle = {} as EndpointHandle<Item>;

    expectTypeOf(handle.insert).toBeCallableWith({ id: 1, name: 'X', price: 1 });
    expectTypeOf(handle.insert).returns.toEqualTypeOf<Item>();
  });

  it('update accepts partial fields', () => {
    const handle = {} as EndpointHandle<Item>;

    expectTypeOf(handle.update).toBeCallableWith(1, { name: 'Y' });
    expectTypeOf(handle.update).toBeCallableWith(1, { price: 5 });
    expectTypeOf(handle.update(1, {})).toEqualTypeOf<Item | undefined>();
  });

  it('where accepts partial filter or predicate', () => {
    const handle = {} as EndpointHandle<Item>;

    // Object filter
    expectTypeOf(handle.where).toBeCallableWith({ price: 1 });
    expectTypeOf(handle.where).toBeCallableWith({ name: 'X', price: 1 });

    // Predicate function
    expectTypeOf(handle.where).toBeCallableWith((item: Item) => item.price > 5);
  });

  it('server.endpoint returns typed handle when generic is provided', async () => {
    const server = await mockr<MyEndpoints>({
      endpoints: [
        { url: '/api/items', data: [] as Item[] },
        { url: '/api/config', body: { theme: 'dark', lang: 'en' } },
      ],
    });

    const items = server.endpoint('/api/items');
    expectTypeOf(items.data).toEqualTypeOf<Item[]>();
    expectTypeOf(items.findById(1)).toEqualTypeOf<Item | undefined>();
  });

  it('handler context endpoints are typed', () => {
    const handler = (
      _req: MockrRequest,
      { endpoints }: { endpoints: <K extends keyof MyEndpoints>(url: K) => EndpointHandle<MyEndpoints[K]> },
    ) => {
      const items = endpoints('/api/items');
      expectTypeOf(items.data).toEqualTypeOf<Item[]>();
      expectTypeOf(items.findById(1)).toEqualTypeOf<Item | undefined>();

      const config = endpoints('/api/config');
      expectTypeOf(config.data).toEqualTypeOf<Config[]>();

      return { body: { count: items.count() } };
    };
    handler; // prevent unused error
  });

  it('request body can be typed', () => {
    type LoginReq = MockrRequest<{ body: { email: string; password: string } }>;
    const req = {} as LoginReq;

    expectTypeOf(req.body.email).toEqualTypeOf<string>();
    expectTypeOf(req.body.password).toEqualTypeOf<string>();
    expectTypeOf(req.params).toEqualTypeOf<Record<string, string>>();
  });

  it('handler() infers body type from zod schema', () => {
    const h = handler({
      body: z.object({ name: z.string(), price: z.number() }),
      fn: (req) => {
        expectTypeOf(req.body.name).toEqualTypeOf<string>();
        expectTypeOf(req.body.price).toEqualTypeOf<number>();
        return { status: 200, body: req.body };
      },
    });
    h; // prevent unused error
  });

  it('handler() infers query type from zod schema', () => {
    const h = handler({
      query: z.object({ page: z.string(), limit: z.string().optional() }),
      fn: (req) => {
        expectTypeOf(req.query.page).toEqualTypeOf<string>();
        expectTypeOf(req.query.limit).toEqualTypeOf<string | undefined>();
        // body remains unknown when no body schema is provided
        expectTypeOf(req.body).toEqualTypeOf<unknown>();
        return { status: 200, body: req.query };
      },
    });
    h;
  });

  it('handler() infers both body and query from zod schemas', () => {
    const h = handler({
      body: z.object({ ids: z.array(z.string()) }),
      query: z.object({ dry_run: z.string().optional() }),
      fn: (req) => {
        expectTypeOf(req.body.ids).toEqualTypeOf<string[]>();
        expectTypeOf(req.query.dry_run).toEqualTypeOf<string | undefined>();
        return { status: 200, body: {} };
      },
    });
    h;
  });

  it('handler() without schemas keeps default types', () => {
    const h = handler({
      fn: (req) => {
        expectTypeOf(req.body).toEqualTypeOf<unknown>();
        expectTypeOf(req.query).toEqualTypeOf<Record<string, string | string[]>>();
        expectTypeOf(req.params).toEqualTypeOf<Record<string, string>>();
        return { status: 200, body: {} };
      },
    });
    h;
  });

  it('EndpointInfo has correct shape', () => {
    const info = {} as EndpointInfo;

    expectTypeOf(info.url).toEqualTypeOf<string>();
    expectTypeOf(info.method).toEqualTypeOf<string>();
    expectTypeOf(info.type).toEqualTypeOf<'data' | 'handler' | 'static'>();
    expectTypeOf(info.enabled).toEqualTypeOf<boolean>();
    expectTypeOf(info.itemCount).toEqualTypeOf<number | null>();
  });

  it('server has endpoint control methods', () => {
    const server = {} as MockrServer;

    expectTypeOf(server.listEndpoints).toBeFunction();
    expectTypeOf(server.listEndpoints()).toEqualTypeOf<EndpointInfo[]>();
    expectTypeOf(server.enableEndpoint).toBeCallableWith('/api/items');
    expectTypeOf(server.enableEndpoint).toBeCallableWith('/api/items', 'GET');
    expectTypeOf(server.disableEndpoint).toBeCallableWith('/api/items');
    expectTypeOf(server.disableEndpoint).toBeCallableWith('/api/items', 'POST');
    expectTypeOf(server.enableAll).toBeFunction();
    expectTypeOf(server.disableAll).toBeFunction();
    expectTypeOf(server.enableAll()).toEqualTypeOf<void>();
    expectTypeOf(server.disableAll()).toEqualTypeOf<void>();
  });

  it('server has proxy control', () => {
    const server = {} as MockrServer;

    expectTypeOf(server.enableProxy).toBeFunction();
    expectTypeOf(server.disableProxy).toBeFunction();
    expectTypeOf(server.enableProxy()).toEqualTypeOf<void>();
    expectTypeOf(server.disableProxy()).toEqualTypeOf<void>();
    expectTypeOf(server.isProxyEnabled).toEqualTypeOf<boolean>();
    expectTypeOf(server.proxyTarget).toEqualTypeOf<string | null>();
  });

  it('server has scenario info', () => {
    const server = {} as MockrServer;

    expectTypeOf(server.listScenarios).toBeFunction();
    expectTypeOf(server.listScenarios()).toEqualTypeOf<string[]>();
    expectTypeOf(server.activeScenario).toEqualTypeOf<string | null>();
  });
});
