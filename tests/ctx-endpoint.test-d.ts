import { describe, it, expectTypeOf } from 'vitest';
import type { HandlerContext } from '../src/types.js';
import type { ListHandle } from '../src/list-handle.js';
import type { RecordHandle } from '../src/record-handle.js';

interface User {
  id: number;
  name: string;
}

interface Config {
  theme: string;
  enabled: boolean;
}

describe('HandlerContext.endpoint (singular)', () => {
  it('ctx.endpoint(url) for list-shaped endpoint returns ListHandle<T>', () => {
    type Endpoints = { '/users': User[] };
    const ctx = {} as HandlerContext<Endpoints>;
    const handle = ctx.endpoint('/users');
    expectTypeOf(handle).toExtend<ListHandle<User>>();
    expectTypeOf(handle.data).toEqualTypeOf<User[]>();
    expectTypeOf(handle.findById(1)).toEqualTypeOf<User | undefined>();
  });

  it('ctx.endpoint(url) for record-shaped endpoint returns RecordHandle<T>', () => {
    type Endpoints = { '/config': Config };
    const ctx = {} as HandlerContext<Endpoints>;
    const handle = ctx.endpoint('/config');
    expectTypeOf(handle).toExtend<RecordHandle<Config>>();
    expectTypeOf(handle.data).toEqualTypeOf<Config>();
  });

  it('plural ctx.endpoints no longer exists', () => {
    type Endpoints = { '/users': User[] };
    const ctx = {} as HandlerContext<Endpoints>;
    // @ts-expect-error — `endpoints` (plural) was renamed to `endpoint` (singular)
    ctx.endpoints('/users');
  });

  it('unknown URL not in Endpoints map is a type error', () => {
    type Endpoints = { '/users': User[] };
    const ctx = {} as HandlerContext<Endpoints>;
    // @ts-expect-error — '/nope' is not a key of Endpoints
    ctx.endpoint('/nope');
  });
});
