import { describe, it, expectTypeOf } from 'vitest';
import { endpoints } from '../src/endpoints-helper.js';
import { mockr } from '../src/server.js';
import type { EndpointDef } from '../src/types.js';

interface Foo {
  id: number;
  label: string;
}

interface Bar {
  id: number;
  weight: number;
}

describe('endpoints<T>() helper types', () => {
  it('accepts a def whose url exists in T', () => {
    type E = { '/x': Foo[] };
    const result = endpoints<E>([
      { url: '/x', data: [] as Foo[] },
    ]);
    expectTypeOf(result).toExtend<ReadonlyArray<EndpointDef<E>>>();
  });

  it('rejects a def whose url is not in T', () => {
    type E = { '/x': Foo[] };
    endpoints<E>([
      // @ts-expect-error — '/notInE' is not a key of E
      { url: '/notInE', data: [] as Foo[] },
    ]);
  });

  it('rejects a data shape mismatch', () => {
    type E = { '/x': Foo[] };
    const bar: Bar = { id: 1, weight: 10 };
    endpoints<E>([
      // @ts-expect-error — Bar[] is not assignable to Foo[]
      { url: '/x', data: [bar] },
    ]);
  });

  it('typed ctx.endpoint(url) inside a handler resolves against T', () => {
    type E = { '/x': Foo[] };
    endpoints<E>([
      {
        url: '/api/labels',
        method: 'GET',
        handler: (_req, ctx) => {
          const handle = ctx.endpoint('/x');
          // ListHandle<Foo>.data is Foo[] — accessing .label proves the element type
          expectTypeOf(handle.data).toEqualTypeOf<Foo[]>();
          const first = handle.data[0];
          if (first) {
            expectTypeOf(first.label).toEqualTypeOf<string>();
          }
          return { status: 200, body: {} };
        },
      },
    ]);
  });

  it('intersection composition: groups compose under mockr<A & B>', () => {
    type A = { '/a': Foo[] };
    type B = { '/b': Bar[] };

    const aMocks = endpoints<A>([{ url: '/a', data: [] as Foo[] }]);
    const bMocks = endpoints<B>([{ url: '/b', data: [] as Bar[] }]);

    type Combined = A & B;
    // No await — type-level assertion only.
    expectTypeOf(mockr<Combined>).toBeFunction();
    void mockr<Combined>({
      endpoints: [...aMocks, ...bMocks],
    });
  });
});
