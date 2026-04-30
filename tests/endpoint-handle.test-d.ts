import { describe, it, expectTypeOf } from 'vitest';
import type { EndpointHandle } from '../src/endpoint-handle.js';
import type { ListHandle } from '../src/list-handle.js';
import type { RecordHandle } from '../src/record-handle.js';

interface Foo {
  id: number;
  name: string;
}

interface Bar {
  a: number;
  b: string;
}

describe('EndpointHandle conditional type', () => {
  it('EndpointHandle<Foo[]> is a ListHandle<Foo>', () => {
    type Handle = EndpointHandle<Foo[]>;
    expectTypeOf<Handle>().toExtend<ListHandle<Foo>>();
    const handle = {} as Handle;
    expectTypeOf(handle.findById(1)).toEqualTypeOf<Foo | undefined>();
    expectTypeOf(handle.insert).toBeCallableWith({ id: 1, name: 'X' });
  });

  it('EndpointHandle<readonly Foo[]> is a ListHandle<Foo>', () => {
    type Handle = EndpointHandle<readonly Foo[]>;
    expectTypeOf<Handle>().toExtend<ListHandle<Foo>>();
  });

  it('EndpointHandle<{ a: 1 }> is a RecordHandle<{ a: 1 }>', () => {
    type Handle = EndpointHandle<{ a: 1 }>;
    expectTypeOf<Handle>().toExtend<RecordHandle<{ a: 1 }>>();
    const handle = {} as Handle;
    expectTypeOf(handle.data).toEqualTypeOf<{ a: 1 }>();
    expectTypeOf(handle.set).toBeCallableWith({ a: 1 });
  });

  it('EndpointHandle<Bar> is a RecordHandle<Bar>', () => {
    type Handle = EndpointHandle<Bar>;
    expectTypeOf<Handle>().toExtend<RecordHandle<Bar>>();
  });

  it('EndpointHandle<string> is never', () => {
    type Handle = EndpointHandle<string>;
    expectTypeOf<Handle>().toEqualTypeOf<never>();
  });

  it('EndpointHandle<number> is never', () => {
    type Handle = EndpointHandle<number>;
    expectTypeOf<Handle>().toEqualTypeOf<never>();
  });

  it('list handle methods are not on a record handle', () => {
    const recordHandle = {} as EndpointHandle<{ a: number }>;
    // @ts-expect-error findById is a list-handle method
    recordHandle.findById(1);
    // @ts-expect-error insert is a list-handle method
    recordHandle.insert({ a: 1 });
  });

  it('record handle methods are not on a list handle', () => {
    const listHandle = {} as EndpointHandle<Foo[]>;
    // @ts-expect-error set is a record-handle method
    listHandle.set({ name: 'X' });
    // @ts-expect-error replace is a record-handle method
    listHandle.replace({ id: 1, name: 'X' });
  });
});
