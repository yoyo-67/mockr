/**
 * Build a fixture factory from a defaults object (or a thunk returning one).
 * The returned function shallow-merges optional overrides over a fresh copy of
 * the defaults and returns a `T`.
 *
 * Pass a thunk when defaults should be regenerated per build — e.g. to draw
 * fresh values from faker:
 *
 * ```ts
 * const aUser = factory<User>(() => ({ id: faker.string.uuid(), name: faker.person.fullName(), tags: [] }));
 * aUser({ name: 'Dana' }); // fresh id, overridden name
 * ```
 *
 * Note: merging is shallow — nested objects/arrays from a static defaults value
 * are shared across builds. Use the thunk form when that matters.
 */
export function factory<T extends object>(defaults: T | (() => T)): (overrides?: Partial<T>) => T {
  return (overrides?: Partial<T>): T => {
    const base = typeof defaults === 'function' ? (defaults as () => T)() : { ...defaults };
    return { ...base, ...overrides };
  };
}
