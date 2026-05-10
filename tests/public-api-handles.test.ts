/**
 * Public API: handle factories (`createListHandle`, `createRecordHandle`,
 * `createEndpointHandle`) and `createMemorySessionStore`.
 *
 * Most behaviours are already tested via list-handle/record-handle/memory-session
 * suites that import internal modules; this file pins them through the *public*
 * entry-point so a renamed re-export is caught immediately.
 */
import { describe, it, expect } from 'vitest';
import {
  createListHandle,
  createRecordHandle,
  createEndpointHandle,
  createMemorySessionStore,
} from '../src/index.js';

describe('createListHandle (via public entry-point)', () => {
  it('returns a handle whose `data` reflects the initial array (deep-copied)', () => {
    const initial = [{ id: 1, name: 'A' }];
    const handle = createListHandle(initial);
    expect(handle.data).toEqual(initial);
    expect(handle.data).not.toBe(initial);
  });

  it('exposes the documented method surface', () => {
    const handle = createListHandle<{ id: number; name?: string }>([{ id: 1 }]);
    for (const method of [
      'findById',
      'where',
      'first',
      'count',
      'has',
      'nextId',
      'insert',
      'update',
      'updateMany',
      'patch',
      'remove',
      'clear',
      'reset',
      'save',
      'replaceData',
    ] as const) {
      expect(typeof (handle as unknown as Record<string, unknown>)[method]).toBe('function');
    }
  });

  it('honours a custom idKey', () => {
    const handle = createListHandle([{ slug: 'a' }, { slug: 'b' }], { idKey: 'slug' });
    expect(handle.findById('b')).toEqual({ slug: 'b' });
    expect(handle.has('a')).toBe(true);
    expect(handle.has('c')).toBe(false);
  });

  it('reset() restores the initial baseline even after mutation', () => {
    const handle = createListHandle([{ id: 1, name: 'A' }]);
    handle.insert({ id: 2, name: 'B' });
    handle.update(1, { name: 'changed' });
    handle.reset();
    expect(handle.data).toEqual([{ id: 1, name: 'A' }]);
  });

  it('replaceData() also moves the reset baseline forward', () => {
    const handle = createListHandle<{ id: number }>([{ id: 1 }]);
    handle.replaceData([{ id: 99 }]);
    handle.insert({ id: 100 });
    handle.reset();
    expect(handle.data).toEqual([{ id: 99 }]);
  });
});

describe('createRecordHandle (via public entry-point)', () => {
  it('owns an isolated copy of the initial value', () => {
    const initial = { theme: 'dark', lang: 'en' };
    const handle = createRecordHandle(initial);
    expect(handle.data).toEqual(initial);
    expect(handle.data).not.toBe(initial);
  });

  it('set() merges, replace() overwrites, reset() restores', () => {
    const handle = createRecordHandle<{ theme: string; lang?: string }>({ theme: 'dark', lang: 'en' });
    handle.set({ lang: 'fr' });
    expect(handle.data).toEqual({ theme: 'dark', lang: 'fr' });
    handle.replace({ theme: 'light' });
    expect(handle.data).toEqual({ theme: 'light' });
    handle.reset();
    expect(handle.data).toEqual({ theme: 'dark', lang: 'en' });
  });
});

describe('createEndpointHandle (via public entry-point)', () => {
  it('returns a list-shaped handle when initial is an array', () => {
    const handle = createEndpointHandle([{ id: 1 }]) as unknown as {
      data: { id: number }[];
      findById: (id: number) => { id: number } | undefined;
    };
    expect(Array.isArray(handle.data)).toBe(true);
    expect(handle.findById(1)).toEqual({ id: 1 });
  });

  it('returns a record-shaped handle when initial is a non-array object', () => {
    const handle = createEndpointHandle({ a: 1 }) as unknown as {
      data: { a: number };
      set: (patch: { a?: number; b?: number }) => void;
    };
    expect(handle.data).toEqual({ a: 1 });
    handle.set({ a: 2 });
    expect(handle.data).toEqual({ a: 2 });
  });
});

describe('createMemorySessionStore (via public entry-point)', () => {
  it('exposes the documented method surface', () => {
    const store = createMemorySessionStore();
    for (const method of [
      'create',
      'get',
      'list',
      'delete',
      'setActive',
      'getActive',
      'recordResponse',
      'lookupResponse',
      'clear',
      'deleteEntry',
      'setCaptureFilter',
      'getCaptureFilter',
      'info',
    ] as const) {
      expect(typeof (store as unknown as Record<string, unknown>)[method]).toBe('function');
    }
  });

  it('create() yields a session that list()/get() return and that delete() can remove', () => {
    const store = createMemorySessionStore();
    const session = store.create('s1');
    expect(session.id).toMatch(/[0-9a-f-]{36}/);
    expect(session.name).toBe('s1');
    expect(session.entries.size).toBe(0);
    expect(store.list()).toHaveLength(1);
    expect(store.get(session.id)).toBe(session);
    expect(store.delete(session.id)).toBe(true);
    expect(store.get(session.id)).toBeUndefined();
    expect(store.list()).toEqual([]);
  });

  it('record / lookup is keyed by method+path+sorted-query and only fires in the matching mode', () => {
    const store = createMemorySessionStore();
    const session = store.create('s1');
    store.setActive(session.id, 'record');
    store.recordResponse(
      { method: 'GET', path: '/x', query: { b: '2', a: '1' } },
      { status: 200, headers: {}, body: { ok: true }, contentType: 'application/json' },
    );
    // recording mode does not serve hits
    expect(
      store.lookupResponse({ method: 'GET', path: '/x', query: { a: '1', b: '2' } }),
    ).toBeUndefined();

    store.setActive(session.id, 'replay');
    const hit = store.lookupResponse({ method: 'GET', path: '/x', query: { a: '1', b: '2' } });
    expect(hit?.status).toBe(200);
    // a different query string is a miss
    expect(
      store.lookupResponse({ method: 'GET', path: '/x', query: { a: '2', b: '1' } }),
    ).toBeUndefined();
  });

  it('only caches GET / HEAD methods', () => {
    const store = createMemorySessionStore();
    const session = store.create('s1');
    store.setActive(session.id, 'record');
    store.recordResponse(
      { method: 'POST', path: '/x', query: {} },
      { status: 200, headers: {}, body: {}, contentType: 'application/json' },
    );
    expect(session.entries.size).toBe(0);
  });

  it('setActive(null, "off") clears the active session', () => {
    const store = createMemorySessionStore();
    const session = store.create('s1');
    store.setActive(session.id, 'record');
    expect(store.getActive()?.session.id).toBe(session.id);
    store.setActive(null, 'off');
    expect(store.getActive()).toBeNull();
  });
});
