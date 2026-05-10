/**
 * Public API surface lock.
 *
 * Pins the runtime shape of `@yoyo-org/mockr`'s entry-point: every named
 * export, the typeof each export, the exact `Symbol.for(...)` registry key
 * for each brand, and the basic invariants of every published factory /
 * type-guard pair.
 *
 * Adding new exports is fine — these assertions only fail when something
 * disappears, gets renamed, or changes typeof. Bumping the package's major
 * version means deliberately editing this file.
 */
import { describe, it, expect } from 'vitest';
import * as api from '../src/index.js';

const EXPECTED_EXPORTS = {
  // server / config entry-points
  mockr: 'function',
  tui: 'function',

  // built-in middleware
  delay: 'function',
  auth: 'function',
  logger: 'function',
  errorInjection: 'function',

  // recorder
  createRecorder: 'function',

  // type generator
  generateInterface: 'function',
  urlToTypeName: 'function',
  urlToFileName: 'function',

  // factories + brands + guards
  handler: 'function',
  isHandlerSpec: 'function',
  HANDLER_SPEC_BRAND: 'symbol',

  ws: 'function',
  isWsSpec: 'function',
  WS_SPEC_BRAND: 'symbol',

  file: 'function',
  isFileRef: 'function',
  getFilePath: 'function',
  FILE_REF_BRAND: 'symbol',

  endpoints: 'function',

  // handles
  createListHandle: 'function',
  createRecordHandle: 'function',
  createEndpointHandle: 'function',

  // memory session store
  createMemorySessionStore: 'function',

  // identity helper
  typedData: 'function',
} as const;

describe('public API: every named export is present with the expected typeof', () => {
  for (const [name, expectedType] of Object.entries(EXPECTED_EXPORTS)) {
    it(`exports ${name} as ${expectedType}`, () => {
      expect(name in api).toBe(true);
      expect(typeof (api as Record<string, unknown>)[name]).toBe(expectedType);
    });
  }

  it('does not silently drop any expected export', () => {
    const missing = Object.keys(EXPECTED_EXPORTS).filter((k) => !(k in api));
    expect(missing).toEqual([]);
  });
});

describe('public API: brand symbols are registered via Symbol.for so they survive realm / dup-package boundaries', () => {
  it('HANDLER_SPEC_BRAND === Symbol.for("mockr.HandlerSpec")', () => {
    expect(api.HANDLER_SPEC_BRAND).toBe(Symbol.for('mockr.HandlerSpec'));
  });

  it('WS_SPEC_BRAND === Symbol.for("mockr.WsSpec")', () => {
    expect(api.WS_SPEC_BRAND).toBe(Symbol.for('mockr.WsSpec'));
  });

  it('FILE_REF_BRAND === Symbol.for("mockr.FileRef")', () => {
    expect(api.FILE_REF_BRAND).toBe(Symbol.for('mockr.FileRef'));
  });
});

describe('public API: factory + type-guard pairs are wired correctly', () => {
  it('handler() output is detected by isHandlerSpec and carries the brand', () => {
    const spec = api.handler({ fn: () => ({ status: 200, body: {} }) });
    expect(api.isHandlerSpec(spec)).toBe(true);
    expect((spec as unknown as Record<symbol, unknown>)[api.HANDLER_SPEC_BRAND]).toBe(true);
  });

  it('isHandlerSpec rejects plain objects, plain functions, primitives, null', () => {
    expect(api.isHandlerSpec({})).toBe(false);
    expect(api.isHandlerSpec(() => undefined)).toBe(false);
    expect(api.isHandlerSpec('handler')).toBe(false);
    expect(api.isHandlerSpec(null)).toBe(false);
    expect(api.isHandlerSpec(undefined)).toBe(false);
  });

  it('ws() output is detected by isWsSpec and carries the brand', () => {
    const spec = api.ws({});
    expect(api.isWsSpec(spec)).toBe(true);
    expect((spec as unknown as Record<symbol, unknown>)[api.WS_SPEC_BRAND]).toBe(true);
  });

  it('isWsSpec rejects plain objects, plain functions, primitives, null', () => {
    expect(api.isWsSpec({})).toBe(false);
    expect(api.isWsSpec(() => undefined)).toBe(false);
    expect(api.isWsSpec('ws')).toBe(false);
    expect(api.isWsSpec(null)).toBe(false);
    expect(api.isWsSpec(undefined)).toBe(false);
  });

  it('file() output is detected by isFileRef, carries the brand, and exposes path', () => {
    const ref = api.file('./data/users.json');
    expect(api.isFileRef(ref)).toBe(true);
    expect((ref as unknown as Record<symbol, unknown>)[api.FILE_REF_BRAND]).toBe(true);
    expect(ref.path).toBe('./data/users.json');
    expect(api.getFilePath(ref)).toBe('./data/users.json');
  });

  it('isFileRef rejects strings, plain objects, null, undefined', () => {
    expect(api.isFileRef('./users.json')).toBe(false);
    expect(api.isFileRef({ path: './users.json' })).toBe(false);
    expect(api.isFileRef(null)).toBe(false);
    expect(api.isFileRef(undefined)).toBe(false);
  });

  it('endpoints() returns the same array reference (runtime no-op)', () => {
    const defs = [{ url: '/api/items', data: [] as unknown[] }] as const;
    const out = api.endpoints(defs);
    expect(out).toBe(defs);
  });

  it('typedData returns the input array as-is', () => {
    const input = [{ id: 1 }, { id: 2 }];
    const out = api.typedData(input);
    expect(out).toBe(input);
  });
});
