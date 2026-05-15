import { describe, it, expectTypeOf } from 'vitest';
import { mockr, handler } from '../src/index.js';
import { ws } from '../src/ws.js';
import type { EndpointDef } from '../src/types.js';

type Endpoints = {
  '/api/users': { id: number; name: string }[];
  '/api/config': { theme: string };
  '/api/notify': unknown;
};

describe('Per-endpoint `delay` field', () => {
  it('accepts fixed-ms shorthand on data endpoint', () => {
    const def: EndpointDef<Endpoints> = {
      url: '/api/users',
      data: [] as { id: number; name: string }[],
      delay: 500,
    };
    expectTypeOf(def.delay).toEqualTypeOf<number | { min: number; max: number } | undefined>();
  });

  it('accepts min/max window on data endpoint', () => {
    const def: EndpointDef<Endpoints> = {
      url: '/api/users',
      data: [] as { id: number; name: string }[],
      delay: { min: 100, max: 800 },
    };
    expectTypeOf(def.delay).toEqualTypeOf<number | { min: number; max: number } | undefined>();
  });

  it('accepts delay on handler endpoint', () => {
    const def: EndpointDef<Endpoints> = {
      url: '/api/users',
      handler: handler({ fn: () => ({ body: [] }) }),
      delay: 250,
    };
    void def;
  });

  it('accepts delay on dataFile endpoint', () => {
    const def: EndpointDef<Endpoints> = {
      url: '/api/users',
      dataFile: './users.json',
      delay: 250,
    };
    void def;
  });

  it('accepts delay on methods-map endpoint', () => {
    const def: EndpointDef<Endpoints> = {
      url: '/api/users',
      methods: {
        GET: handler({ fn: () => ({ body: [] }) }),
      },
      delay: { min: 50, max: 150 },
    };
    void def;
  });

  it('rejects string `delay` at type level', () => {
    // @ts-expect-error — delay must be number or {min,max}
    const def: EndpointDef<Endpoints> = { url: '/api/users', data: [], delay: 'fast' };
    void def;
  });

  it('rejects `{ ms }` shorthand (only fixed-number or min/max allowed per ADR-0001)', () => {
    // @ts-expect-error — { ms } form not on endpoint-level delay
    const def: EndpointDef<Endpoints> = { url: '/api/users', data: [], delay: { ms: 500 } };
    void def;
  });

  it('rejects `delay` on WS endpoint (WS variant uses `delay?: never`)', () => {
    // @ts-expect-error — delay forbidden on WS endpoint
    const def: EndpointDef<Endpoints> = {
      url: '/api/notify',
      ws: ws({ onMessage: () => undefined }),
      delay: 500,
    };
    void def;
  });

  it('flows through `mockr<T>` config typecheck', async () => {
    const server = await mockr<Endpoints>({
      endpoints: [
        { url: '/api/users', data: [], delay: 500 },
        { url: '/api/config', data: { theme: 'dark' }, delay: { min: 100, max: 300 } },
      ],
    });
    void server;
  });
});
