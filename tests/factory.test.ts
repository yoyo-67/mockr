import { describe, it, expect } from 'vitest';
import { factory } from '../src/factory.js';

interface User {
  id: string;
  name: string;
  tags: string[];
}

describe('factory', () => {
  it('returns the defaults when given no overrides', () => {
    const make = factory<User>({ id: '1', name: 'a', tags: [] });
    expect(make()).toEqual({ id: '1', name: 'a', tags: [] });
  });

  it('applies overrides over the defaults', () => {
    const make = factory<User>({ id: '1', name: 'a', tags: [] });
    expect(make({ name: 'b' })).toEqual({ id: '1', name: 'b', tags: [] });
  });

  it('returns a fresh object each call', () => {
    const make = factory<User>({ id: '1', name: 'a', tags: [] });
    expect(make()).not.toBe(make());
  });

  it('calls a defaults thunk per build (fresh values each time)', () => {
    let n = 0;
    const make = factory<User>(() => ({ id: String((n += 1)), name: 'a', tags: [] }));
    expect(make().id).toBe('1');
    expect(make().id).toBe('2');
  });

  it('applies overrides over a defaults thunk', () => {
    const make = factory<User>(() => ({ id: 'x', name: 'a', tags: [] }));
    expect(make({ name: 'z' })).toEqual({ id: 'x', name: 'z', tags: [] });
  });
});
