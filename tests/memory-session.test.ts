import { describe, it, expect } from 'vitest';
import { createMemorySessionStore } from '../src/memory-session.js';

describe('MemorySessionStore', () => {
  describe('lifecycle', () => {
    it('creates a session with id, name, empty entries, and createdAt', () => {
      const store = createMemorySessionStore();
      const session = store.create('my-session');

      expect(session.id).toBeTruthy();
      expect(session.name).toBe('my-session');
      expect(session.entries.size).toBe(0);
      expect(session.createdAt).toBeGreaterThan(0);
    });

    it('gives each session a unique id', () => {
      const store = createMemorySessionStore();
      const s1 = store.create('a');
      const s2 = store.create('b');
      expect(s1.id).not.toBe(s2.id);
    });

    it('list() returns all sessions in creation order', () => {
      const store = createMemorySessionStore();
      store.create('first');
      store.create('second');
      store.create('third');

      const names = store.list().map((s) => s.name);
      expect(names).toEqual(['first', 'second', 'third']);
    });

    it('get() returns the session by id, or undefined', () => {
      const store = createMemorySessionStore();
      const s = store.create('x');
      expect(store.get(s.id)?.name).toBe('x');
      expect(store.get('missing')).toBeUndefined();
    });

    it('delete() removes the session and returns true; false if unknown', () => {
      const store = createMemorySessionStore();
      const s = store.create('x');
      expect(store.delete(s.id)).toBe(true);
      expect(store.get(s.id)).toBeUndefined();
      expect(store.delete('nope')).toBe(false);
    });

    it('deleting the active session deactivates it', () => {
      const store = createMemorySessionStore();
      const s = store.create('x');
      store.setActive(s.id, 'record');
      store.delete(s.id);
      expect(store.getActive()).toBeNull();
    });
  });

  describe('activate / deactivate', () => {
    it('setActive with id + mode makes getActive return session + mode', () => {
      const store = createMemorySessionStore();
      const s = store.create('x');
      store.setActive(s.id, 'record');

      const active = store.getActive();
      expect(active?.session.id).toBe(s.id);
      expect(active?.mode).toBe('record');
    });

    it('setActive with null clears the active session', () => {
      const store = createMemorySessionStore();
      const s = store.create('x');
      store.setActive(s.id, 'replay');
      store.setActive(null, 'off');
      expect(store.getActive()).toBeNull();
    });

    it('only one session is active at a time — activating a second replaces the first', () => {
      const store = createMemorySessionStore();
      const s1 = store.create('one');
      const s2 = store.create('two');
      store.setActive(s1.id, 'record');
      store.setActive(s2.id, 'replay');

      const active = store.getActive();
      expect(active?.session.id).toBe(s2.id);
      expect(active?.mode).toBe('replay');
    });

    it('setActive with unknown id throws', () => {
      const store = createMemorySessionStore();
      expect(() => store.setActive('missing', 'record')).toThrow();
    });
  });

  describe('record / lookup', () => {
    it('recordResponse stores a response under METHOD + path + normalized query', () => {
      const store = createMemorySessionStore();
      const s = store.create('x');
      store.setActive(s.id, 'record');

      store.recordResponse(
        { method: 'GET', path: '/api/users', query: {} },
        { status: 200, headers: {}, body: [{ id: 1 }], contentType: 'application/json' },
      );

      expect(s.entries.size).toBe(1);
    });

    it('lookupResponse returns the cached response for a known key', () => {
      const store = createMemorySessionStore();
      const s = store.create('x');
      store.setActive(s.id, 'record');

      const cached = { status: 200, headers: {}, body: { ok: true }, contentType: 'application/json' };
      store.recordResponse({ method: 'GET', path: '/api/ping', query: {} }, cached);

      store.setActive(s.id, 'replay');
      const hit = store.lookupResponse({ method: 'GET', path: '/api/ping', query: {} });
      expect(hit?.body).toEqual({ ok: true });
    });

    it('lookupResponse returns undefined for unknown keys', () => {
      const store = createMemorySessionStore();
      const s = store.create('x');
      store.setActive(s.id, 'replay');
      expect(store.lookupResponse({ method: 'GET', path: '/api/missing', query: {} })).toBeUndefined();
    });

    it('query string order does not affect the cache key', () => {
      const store = createMemorySessionStore();
      const s = store.create('x');
      store.setActive(s.id, 'record');

      store.recordResponse(
        { method: 'GET', path: '/api/users', query: { limit: '10', sort: 'name' } },
        { status: 200, headers: {}, body: [], contentType: 'application/json' },
      );

      store.setActive(s.id, 'replay');
      const hit = store.lookupResponse({
        method: 'GET',
        path: '/api/users',
        query: { sort: 'name', limit: '10' },
      });
      expect(hit).toBeDefined();
    });

    it('different methods on the same path are separate entries', () => {
      const store = createMemorySessionStore();
      const s = store.create('x');
      store.setActive(s.id, 'record');

      store.recordResponse(
        { method: 'GET', path: '/api/x', query: {} },
        { status: 200, headers: {}, body: 'get', contentType: 'text/plain' },
      );
      // POST is not cached by default, so we force it via a GET-alike that differs only by method
      // Use HEAD which is also idempotent to assert method is in the key.
      store.recordResponse(
        { method: 'HEAD', path: '/api/x', query: {} },
        { status: 200, headers: {}, body: '', contentType: 'text/plain' },
      );

      expect(s.entries.size).toBe(2);
    });

    it('recordResponse is a no-op when there is no active session', () => {
      const store = createMemorySessionStore();
      store.recordResponse(
        { method: 'GET', path: '/api/x', query: {} },
        { status: 200, headers: {}, body: {}, contentType: 'application/json' },
      );
      // Nothing to assert beyond: no throw, no crash.
    });

    it('recordResponse is a no-op when active mode is not record', () => {
      const store = createMemorySessionStore();
      const s = store.create('x');
      store.setActive(s.id, 'replay');
      store.recordResponse(
        { method: 'GET', path: '/api/x', query: {} },
        { status: 200, headers: {}, body: {}, contentType: 'application/json' },
      );
      expect(s.entries.size).toBe(0);
    });

    it('lookupResponse is a no-op when active mode is not replay', () => {
      const store = createMemorySessionStore();
      const s = store.create('x');
      store.setActive(s.id, 'record');

      store.recordResponse(
        { method: 'GET', path: '/api/x', query: {} },
        { status: 200, headers: {}, body: 'hi', contentType: 'text/plain' },
      );

      const hit = store.lookupResponse({ method: 'GET', path: '/api/x', query: {} });
      expect(hit).toBeUndefined();
    });

    it('does not cache non-GET methods by default', () => {
      const store = createMemorySessionStore();
      const s = store.create('x');
      store.setActive(s.id, 'record');

      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        store.recordResponse(
          { method, path: '/api/x', query: {} },
          { status: 200, headers: {}, body: {}, contentType: 'application/json' },
        );
      }
      expect(s.entries.size).toBe(0);
    });

    it('array-valued query params are included deterministically in the key', () => {
      const store = createMemorySessionStore();
      const s = store.create('x');
      store.setActive(s.id, 'record');

      store.recordResponse(
        { method: 'GET', path: '/api/x', query: { tag: ['a', 'b'] } },
        { status: 200, headers: {}, body: [], contentType: 'application/json' },
      );

      store.setActive(s.id, 'replay');
      const hit = store.lookupResponse({ method: 'GET', path: '/api/x', query: { tag: ['a', 'b'] } });
      expect(hit).toBeDefined();

      const miss = store.lookupResponse({ method: 'GET', path: '/api/x', query: { tag: ['b', 'a'] } });
      // Order of repeated values matters (arrays are ordered), so b-then-a is a different key
      expect(miss).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('clear(id) empties entries but keeps the session', () => {
      const store = createMemorySessionStore();
      const s = store.create('x');
      store.setActive(s.id, 'record');

      store.recordResponse(
        { method: 'GET', path: '/a', query: {} },
        { status: 200, headers: {}, body: {}, contentType: 'application/json' },
      );
      expect(s.entries.size).toBe(1);

      store.clear(s.id);
      expect(s.entries.size).toBe(0);
      expect(store.get(s.id)).toBeDefined();
    });
  });

  describe('session isolation', () => {
    it('recording under one session does not leak into another', () => {
      const store = createMemorySessionStore();
      const s1 = store.create('one');
      const s2 = store.create('two');

      store.setActive(s1.id, 'record');
      store.recordResponse(
        { method: 'GET', path: '/a', query: {} },
        { status: 200, headers: {}, body: 'from-s1', contentType: 'text/plain' },
      );

      store.setActive(s2.id, 'replay');
      expect(store.lookupResponse({ method: 'GET', path: '/a', query: {} })).toBeUndefined();

      store.setActive(s1.id, 'replay');
      expect(store.lookupResponse({ method: 'GET', path: '/a', query: {} })?.body).toBe('from-s1');
    });
  });
});
