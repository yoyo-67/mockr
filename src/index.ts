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
  ValidatedHandler,
} from './types.js';
export type {
  Recorder,
  RecorderOptions,
  RecordedEntryMeta,
  SessionMeta,
  RecordInput,
} from './recorder.js';

import type { ParseableSchema, ValidatedHandler } from './types.js';

export function typedData<T>(data: T[]): T[] {
  return data;
}

export function handler<
  TBody extends ParseableSchema | undefined = undefined,
  TQuery extends ParseableSchema | undefined = undefined,
  TParams extends ParseableSchema | undefined = undefined,
  TEndpoints = Record<string, unknown>,
>(h: ValidatedHandler<TBody, TQuery, TParams, TEndpoints>): ValidatedHandler<TBody, TQuery, TParams, TEndpoints> {
  return h;
}
