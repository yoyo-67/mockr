export { mockr } from './server.js';
export { tui } from './tui.js';
export { delay, auth, logger, errorInjection } from './middleware.js';
export { createRecorder } from './recorder.js';
export { generateInterface, urlToTypeName, urlToFileName } from './type-generator.js';
export type {
  MockrRequest,
  MockrServer,
  MockrConfig,
  EndpointHandle,
  EndpointDef,
  HandlerContext,
  HandlerResult,
  Middleware,
  ScenarioSetup,
  EndpointInfo,
  ParseableSchema,
} from './types.js';
export { handler, isHandlerSpec, HANDLER_SPEC_BRAND } from './handler.js';
export type { HandlerSpec } from './handler.js';
export { createListHandle } from './list-handle.js';
export type { ListHandle, ListHandleOptions } from './list-handle.js';
export { createRecordHandle } from './record-handle.js';
export type { RecordHandle } from './record-handle.js';
export { createEndpointHandle } from './endpoint-handle.js';
export type { EndpointHandleOptions } from './endpoint-handle.js';
export type {
  Recorder,
  RecorderOptions,
  RecordedEntryMeta,
  SessionMeta,
  RecordInput,
} from './recorder.js';
export { createMemorySessionStore } from './memory-session.js';
export type {
  MemorySession,
  MemorySessionStore,
  CachedResponse,
  SessionMode,
  SessionInfo as MemorySessionStoreInfo,
} from './memory-session.js';
export type { MemorySessionInfo, MemorySessionEntry } from './types.js';

export function typedData<T>(data: T[]): T[] {
  return data;
}
