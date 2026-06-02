import { describe, it, expectTypeOf } from 'vitest';
import { factory } from '../src/factory.js';

interface User {
  id: string;
  name: string;
  tags: string[];
}

describe('factory types', () => {
  it('produces T from optional partial overrides', () => {
    const make = factory<User>({ id: '', name: '', tags: [] });
    expectTypeOf(make).toEqualTypeOf<(overrides?: Partial<User>) => User>();
    expectTypeOf(make({ name: 'x' })).toEqualTypeOf<User>();
  });

  it('rejects an override of the wrong type', () => {
    const make = factory<User>({ id: '', name: '', tags: [] });
    // @ts-expect-error — name must be a string
    make({ name: 123 });
  });

  it('accepts a defaults thunk', () => {
    const make = factory<User>(() => ({ id: '', name: '', tags: [] }));
    expectTypeOf(make()).toEqualTypeOf<User>();
  });
});
