/**
 * Type-level public API surface lock.
 *
 * Pins every type / interface / type alias re-exported from
 * `@yoyo-org/mockr`'s entry-point. Importing under a name and using each in a
 * trivial position is enough — if the export disappears or is renamed, the
 * file fails typecheck. Adding new exports does not break this file.
 */
import { describe, it, expectTypeOf } from 'vitest';
import type {
  // server / config types
  MockrRequest,
  MockrServer,
  MockrConfig,
  EndpointHandle,
  EndpointDef,
  EndpointDelay,
  EndpointDelayControl,
  HandlerContext,
  HandlerResult,
  Middleware,
  ScenarioSetup,
  EndpointInfo,
  ParseableSchema,

  // factories
  HandlerSpec,
  WsSpec,
  WsEndpoint,
  WsHandle,
  WsClient,
  WsFactoryOpts,
  WsConnectCtx,
  WsMessageCtx,
  WsCloseCtx,
  FileRef,

  // handles
  ListHandle,
  ListHandleOptions,
  RecordHandle,
  EndpointHandleOptions,

  // recorder
  Recorder,
  RecorderOptions,
  RecordedEntryMeta,
  SessionMeta,
  RecordInput,

  // memory session store
  MemorySession,
  MemorySessionStore,
  CachedResponse,
  SessionMode,
  MemorySessionStoreInfo,
  MemorySessionInfo,
  MemorySessionEntry,
} from '../src/index.js';

describe('public type exports — every documented type resolves', () => {
  it('server / config types', () => {
    expectTypeOf<MockrRequest>().not.toBeNever();
    expectTypeOf<MockrServer>().not.toBeNever();
    expectTypeOf<MockrConfig>().not.toBeNever();
    expectTypeOf<EndpointHandle>().not.toBeNever();
    expectTypeOf<EndpointDef>().not.toBeNever();
    expectTypeOf<EndpointDelay>().not.toBeNever();
    expectTypeOf<EndpointDelayControl>().not.toBeNever();
    expectTypeOf<HandlerContext>().not.toBeNever();
    expectTypeOf<HandlerResult>().not.toBeNever();
    expectTypeOf<Middleware>().not.toBeNever();
    expectTypeOf<ScenarioSetup>().not.toBeNever();
    expectTypeOf<EndpointInfo>().not.toBeNever();
    expectTypeOf<ParseableSchema>().not.toBeNever();
  });

  it('factory result types', () => {
    expectTypeOf<HandlerSpec>().not.toBeNever();
    expectTypeOf<WsSpec>().not.toBeNever();
    expectTypeOf<WsEndpoint>().not.toBeNever();
    expectTypeOf<WsHandle>().not.toBeNever();
    expectTypeOf<WsClient>().not.toBeNever();
    expectTypeOf<WsFactoryOpts<unknown, unknown, unknown>>().not.toBeNever();
    expectTypeOf<WsConnectCtx<unknown, unknown>>().not.toBeNever();
    expectTypeOf<WsMessageCtx<unknown, unknown, unknown>>().not.toBeNever();
    expectTypeOf<WsCloseCtx<unknown>>().not.toBeNever();
    expectTypeOf<FileRef>().not.toBeNever();
  });

  it('handle types', () => {
    expectTypeOf<ListHandle<unknown>>().not.toBeNever();
    expectTypeOf<ListHandleOptions>().not.toBeNever();
    expectTypeOf<RecordHandle<{ a: 1 }>>().not.toBeNever();
    expectTypeOf<EndpointHandleOptions>().not.toBeNever();
  });

  it('recorder types', () => {
    expectTypeOf<Recorder>().not.toBeNever();
    expectTypeOf<RecorderOptions>().not.toBeNever();
    expectTypeOf<RecordedEntryMeta>().not.toBeNever();
    expectTypeOf<SessionMeta>().not.toBeNever();
    expectTypeOf<RecordInput>().not.toBeNever();
  });

  it('memory session store types', () => {
    expectTypeOf<MemorySession>().not.toBeNever();
    expectTypeOf<MemorySessionStore>().not.toBeNever();
    expectTypeOf<CachedResponse>().not.toBeNever();
    expectTypeOf<SessionMode>().not.toBeNever();
    expectTypeOf<MemorySessionStoreInfo>().not.toBeNever();
    expectTypeOf<MemorySessionInfo>().not.toBeNever();
    expectTypeOf<MemorySessionEntry>().not.toBeNever();
  });
});

describe('public function signatures — pin core call shapes', () => {
  it('mockr is callable with a config and returns Promise<MockrServer<E>>', async () => {
    const { mockr } = await import('../src/index.js');
    type Endpoints = { '/api/items': { id: number }[] };
    expectTypeOf(mockr<Endpoints>).toBeCallableWith({
      endpoints: [{ url: '/api/items', data: [] }],
    });
    expectTypeOf(mockr<Endpoints>).returns.resolves.toExtend<MockrServer<Endpoints>>();
  });

  it('handler() output is recognised as a HandlerSpec', async () => {
    const { handler } = await import('../src/index.js');
    expectTypeOf(handler({ fn: () => ({ status: 200, body: {} }) })).toExtend<HandlerSpec>();
  });

  it('ws() output is recognised as a WsSpec', async () => {
    const { ws } = await import('../src/index.js');
    expectTypeOf(ws({})).toExtend<WsSpec>();
  });

  it('file() output is recognised as a FileRef', async () => {
    const { file } = await import('../src/index.js');
    expectTypeOf(file('./users.json')).toExtend<FileRef>();
    expectTypeOf(file<{ id: number }[]>('./users.json')).toExtend<FileRef<{ id: number }[]>>();
  });

  it('createMemorySessionStore() returns MemorySessionStore', async () => {
    const { createMemorySessionStore } = await import('../src/index.js');
    expectTypeOf(createMemorySessionStore()).toExtend<MemorySessionStore>();
  });

  it('createListHandle / createRecordHandle / createEndpointHandle return shapes', async () => {
    const { createListHandle, createRecordHandle, createEndpointHandle } = await import(
      '../src/index.js'
    );
    expectTypeOf(createListHandle<{ id: number }>([])).toExtend<ListHandle<{ id: number }>>();
    expectTypeOf(createRecordHandle<{ a: number }>({ a: 1 })).toExtend<RecordHandle<{ a: number }>>();
    // createEndpointHandle returns the conditional EndpointHandle<T>
    expectTypeOf(createEndpointHandle([{ id: 1 }])).toExtend<EndpointHandle<{ id: number }[]>>();
  });
});
