import { describe, it, expect, afterEach } from 'vitest';
import { mockr } from '../src/index.js';
import { mockGroup } from '../src/mock-group.js';
import { LIST_CRUD, RECORD_CRUD } from '../src/crud-matrix.js';

/**
 * Anti-drift guard: the OpenAPI generator trusts LIST_CRUD / RECORD_CRUD to
 * describe what the dispatcher serves. These tests boot a real server and prove
 * the dispatcher serves EXACTLY that matrix — so changing server CRUD without
 * updating the matrix (and vice-versa) fails CI.
 */

const open: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (open.length) {
    const s = open.pop()!;
    try { await s.close(); } catch { /* already closed */ }
  }
});

const bodyFor = (verb: string) => (verb === 'GET' || verb === 'DELETE' ? undefined : JSON.stringify({ id: '1', title: 'x' }));

describe('CRUD matrix matches the dispatcher', () => {
  it('list data endpoint serves exactly LIST_CRUD', async () => {
    const defs = mockGroup<{ '/api/todos': { id: string; title: string }[] }>()
      .data('/api/todos', [{ id: '1', title: 'a' }])
      .done();
    const server = await mockr({ endpoints: defs as never });
    open.push(server);

    for (const op of LIST_CRUD) {
      const url = op.scope === 'item' ? `${server.url}/api/todos/1` : `${server.url}/api/todos`;
      const res = await fetch(url, {
        method: op.verb,
        headers: bodyFor(op.verb) ? { 'Content-Type': 'application/json' } : undefined,
        body: bodyFor(op.verb),
      });
      expect.soft(res.status, `${op.verb} ${op.scope}`).toBe(op.status);
    }
  });

  it('record data endpoint serves exactly RECORD_CRUD', async () => {
    const defs = mockGroup<{ '/api/config': { theme: string } }>()
      .data('/api/config', { theme: 'dark' })
      .done();
    const server = await mockr({ endpoints: defs as never });
    open.push(server);

    for (const op of RECORD_CRUD) {
      const res = await fetch(`${server.url}/api/config`, {
        method: op.verb,
        headers: bodyFor(op.verb) ? { 'Content-Type': 'application/json' } : undefined,
        body: bodyFor(op.verb),
      });
      expect.soft(res.status, `${op.verb}`).toBe(op.status);
    }
  });
});
