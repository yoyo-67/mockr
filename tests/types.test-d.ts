import { describe, it, expectTypeOf } from 'vitest';
import { mockr, handler, type EndpointHandle, type EndpointInfo, type MockrRequest, type MockrServer, type MockrConfig, type HandlerResult, type Recorder, type RecordedEntryMeta, type SessionMeta, type RecordInput } from '../src/index.js';
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
  '/api/items': Item[];
  '/api/config': Config;
};

describe('Type inference', () => {
  it('endpoint handle with array T', () => {
    const handle = {} as EndpointHandle<Item[]>;

    expectTypeOf(handle.data).toEqualTypeOf<Item[]>();
    expectTypeOf(handle.body).toEqualTypeOf<Item[]>();
    expectTypeOf(handle.findById(1)).toEqualTypeOf<Item | undefined>();
    expectTypeOf(handle.where({ price: 1 })).toEqualTypeOf<Item[]>();
    expectTypeOf(handle.first()).toEqualTypeOf<Item | undefined>();
    expectTypeOf(handle.count()).toEqualTypeOf<number>();
    expectTypeOf(handle.has(1)).toEqualTypeOf<boolean>();
  });

  it('endpoint handle with object T', () => {
    const handle = {} as EndpointHandle<Config>;

    expectTypeOf(handle.data).toEqualTypeOf<Config>();
    expectTypeOf(handle.body).toEqualTypeOf<Config>();
  });

  it('insert accepts element type', () => {
    const handle = {} as EndpointHandle<Item[]>;

    expectTypeOf(handle.insert).toBeCallableWith({ id: 1, name: 'X', price: 1 });
    expectTypeOf(handle.insert).returns.toEqualTypeOf<Item>();
  });

  it('update accepts partial element fields', () => {
    const handle = {} as EndpointHandle<Item[]>;

    expectTypeOf(handle.update).toBeCallableWith(1, { name: 'Y' });
    expectTypeOf(handle.update).toBeCallableWith(1, { price: 5 });
    expectTypeOf(handle.update(1, {})).toEqualTypeOf<Item | undefined>();
  });

  it('where accepts partial filter or predicate', () => {
    const handle = {} as EndpointHandle<Item[]>;

    expectTypeOf(handle.where).toBeCallableWith({ price: 1 });
    expectTypeOf(handle.where).toBeCallableWith({ name: 'X', price: 1 });
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

    const config = server.endpoint('/api/config');
    expectTypeOf(config.body).toEqualTypeOf<Config>();
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
      expectTypeOf(config.body).toEqualTypeOf<Config>();

      return { body: { count: items.count() } };
    };
    handler;
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

describe('Recorder type inference', () => {
  it('MockrConfig accepts recorder with sessionsDir', () => {
    const config: MockrConfig = { port: 3000, recorder: { sessionsDir: './sessions' } };
    config;
  });

  it('MockrConfig recorder is optional', () => {
    const config: MockrConfig = { port: 3000 };
    config;
  });

  it('MockrConfig recorder sessionsDir is optional', () => {
    const config: MockrConfig = { recorder: {} };
    config;
  });

  it('HandlerResult accepts raw string body', () => {
    const result: HandlerResult = { raw: true, body: '<html></html>', status: 200, headers: { 'content-type': 'text/html' } };
    result;
  });

  it('HandlerResult accepts raw Buffer body', () => {
    const result: HandlerResult = { raw: true, body: Buffer.from('binary'), status: 200, headers: { 'content-type': 'application/octet-stream' } };
    result;
  });

  it('server.recorder can be null', () => {
    const server = {} as MockrServer;
    expectTypeOf(server.recorder).toEqualTypeOf<MockrServer['recorder']>();
  });

  it('server.recorder.startSession is callable', () => {
    type RecorderApi = NonNullable<MockrServer['recorder']>;
    const rec = {} as RecorderApi;
    expectTypeOf(rec.startSession).toBeCallableWith('name', 'http://example.com');
  });

  it('server.recorder.stopSession is callable', () => {
    type RecorderApi = NonNullable<MockrServer['recorder']>;
    const rec = {} as RecorderApi;
    expectTypeOf(rec.stopSession).toBeCallableWith('session-id');
  });

  it('server.recorder.listSessions is a function', () => {
    type RecorderApi = NonNullable<MockrServer['recorder']>;
    const rec = {} as RecorderApi;
    expectTypeOf(rec.listSessions).toBeFunction();
  });

  it('server.recorder.mapToFile is callable', () => {
    type RecorderApi = NonNullable<MockrServer['recorder']>;
    const rec = {} as RecorderApi;
    expectTypeOf(rec.mapToFile).toBeCallableWith('session-id', ['entry-1']);
  });

  it('Recorder has all session management methods', () => {
    const recorder = {} as Recorder;
    expectTypeOf(recorder.startSession).toBeFunction();
    expectTypeOf(recorder.record).toBeFunction();
    expectTypeOf(recorder.stopSession).toBeFunction();
  });

  it('Recorder has all query methods', () => {
    const recorder = {} as Recorder;
    expectTypeOf(recorder.listSessions).toBeFunction();
    expectTypeOf(recorder.loadSession).toBeFunction();
    expectTypeOf(recorder.deleteSession).toBeFunction();
  });

  it('RecordedEntryMeta has required string fields', () => {
    const entry = {} as RecordedEntryMeta;
    expectTypeOf(entry.id).toEqualTypeOf<string>();
    expectTypeOf(entry.url).toEqualTypeOf<string>();
    expectTypeOf(entry.method).toEqualTypeOf<string>();
    expectTypeOf(entry.contentType).toEqualTypeOf<string>();
  });

  it('RecordedEntryMeta has required number fields', () => {
    const entry = {} as RecordedEntryMeta;
    expectTypeOf(entry.status).toEqualTypeOf<number>();
    expectTypeOf(entry.size).toEqualTypeOf<number>();
    expectTypeOf(entry.timestamp).toEqualTypeOf<number>();
  });

  it('RecordedEntryMeta timing is optional', () => {
    const entry = {} as RecordedEntryMeta;
    expectTypeOf(entry.timing).toEqualTypeOf<number | undefined>();
  });

  it('SessionMeta has identity fields', () => {
    const session = {} as SessionMeta;
    expectTypeOf(session.id).toEqualTypeOf<string>();
    expectTypeOf(session.name).toEqualTypeOf<string>();
    expectTypeOf(session.baseUrl).toEqualTypeOf<string>();
  });

  it('SessionMeta has entries array', () => {
    const session = {} as SessionMeta;
    expectTypeOf(session.entries).toEqualTypeOf<RecordedEntryMeta[]>();
  });

  it('SessionMeta stoppedAt is optional', () => {
    const session = {} as SessionMeta;
    expectTypeOf(session.startedAt).toEqualTypeOf<number>();
    expectTypeOf(session.stoppedAt).toEqualTypeOf<number | undefined>();
  });

  it('RecordInput has required fields', () => {
    const input = {} as RecordInput;
    expectTypeOf(input.sessionId).toEqualTypeOf<string>();
    expectTypeOf(input.url).toEqualTypeOf<string>();
    expectTypeOf(input.method).toEqualTypeOf<string>();
    expectTypeOf(input.body).toEqualTypeOf<string>();
  });

  it('RecordInput responseHeaders is a string record', () => {
    const input = {} as RecordInput;
    expectTypeOf(input.responseHeaders).toEqualTypeOf<Record<string, string>>();
  });

  it('RecordInput timing is optional', () => {
    const input = {} as RecordInput;
    expectTypeOf(input.timing).toEqualTypeOf<number | undefined>();
  });

  it('Recorder has sessionsDir', () => {
    const recorder = {} as Recorder;
    expectTypeOf(recorder.sessionsDir).toEqualTypeOf<string>();
  });
});

describe('Mapped endpoint type inference', () => {
  interface Project {
    id: string;
    name: string;
  }

  type AppEndpoints = {
    '/api/items': { id: number; name: string }[];   // array → data endpoint
    '/api/projects': { projects: Project[] };         // object → static endpoint
  };

  it('data endpoint .data is the array type', async () => {
    const server = await mockr<AppEndpoints>({
      endpoints: [{ url: '/api/items', data: [{ id: 1, name: 'A' }] }],
    });
    const handle = server.endpoint('/api/items');
    expectTypeOf(handle.data).toEqualTypeOf<{ id: number; name: string }[]>();
    expectTypeOf(handle.findById(1)).toEqualTypeOf<{ id: number; name: string } | undefined>();
  });

  it('static endpoint .body is the object type', async () => {
    const server = await mockr<AppEndpoints>({
      endpoints: [{ url: '/api/projects', body: { projects: [] } }],
    });
    const handle = server.endpoint('/api/projects');
    expectTypeOf(handle.body).toEqualTypeOf<{ projects: Project[] }>();
    expectTypeOf(handle.data).toEqualTypeOf<{ projects: Project[] }>();
  });

  it('handler context endpoints are typed from Endpoints generic', async () => {
    const server = await mockr<AppEndpoints>({
      endpoints: [
        { url: '/api/items', data: [] },
        {
          url: '/api/projects',
          handler: (_req, ctx) => {
            const items = ctx.endpoints('/api/items');
            expectTypeOf(items.data).toEqualTypeOf<{ id: number; name: string }[]>();
            expectTypeOf(items.findById(1)).toEqualTypeOf<{ id: number; name: string } | undefined>();
            return { body: { count: items.count() } };
          },
        },
      ],
    });
    server;
  });

  it('server.recorder.mapToFile returns mapped result', () => {
    type RecorderApi = NonNullable<MockrServer['recorder']>;
    const rec = {} as RecorderApi;
    expectTypeOf(rec.mapToFile).toBeCallableWith('session-id', ['entry-1']);
    expectTypeOf(rec.mapToFile).toBeCallableWith('session-id', ['entry-1'], { generateTypes: true });
  });

  it('MockrConfig accepts recorder options', () => {
    const config: MockrConfig = {
      recorder: { mocksDir: './mocks', serverFile: './src/server.ts' },
    };
    config;
  });
});
