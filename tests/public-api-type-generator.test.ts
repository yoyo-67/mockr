/**
 * Public API: type generator helpers (`urlToTypeName`, `urlToFileName`,
 * `generateInterface`).
 *
 * These functions are part of the published surface and used by the recorder
 * to produce on-disk `*.types.ts` files. Their string outputs are observable
 * by users (filenames written, contents committed), so the format is a stable
 * contract — these tests pin it.
 */
import { describe, it, expect } from 'vitest';
import { urlToTypeName, urlToFileName, generateInterface } from '../src/index.js';

describe('urlToTypeName', () => {
  it('strips a leading slash and PascalCases path segments', () => {
    expect(urlToTypeName('/api/users')).toBe('ApiUsers');
  });

  it('drops non-alphanumeric chars and PascalCases the survivors', () => {
    expect(urlToTypeName('/api/users-list/v2')).toBe('ApiUsersListV2');
  });

  it('handles a single segment', () => {
    expect(urlToTypeName('/users')).toBe('Users');
  });

  it('handles an input without a leading slash', () => {
    expect(urlToTypeName('api/users')).toBe('ApiUsers');
  });
});

describe('urlToFileName', () => {
  it('strips the leading slash and joins segments with hyphens', () => {
    expect(urlToFileName('/api/users')).toBe('api-users');
  });

  it('strips a trailing slash', () => {
    expect(urlToFileName('/api/users/')).toBe('api-users');
  });

  it('replaces every non-alphanumeric run with a single hyphen', () => {
    expect(urlToFileName('/api/users--list/v2')).toBe('api-users-list-v2');
  });
});

describe('generateInterface', () => {
  it('emits a primitive type alias when the value is a primitive', () => {
    expect(generateInterface('Status', 'ok')).toBe('export type Status = string;\n');
    expect(generateInterface('Count', 42)).toBe('export type Count = number;\n');
    expect(generateInterface('Flag', true)).toBe('export type Flag = boolean;\n');
  });

  it('emits an interface for an object value', () => {
    const out = generateInterface('User', { id: 1, name: 'Alice' });
    expect(out).toContain('export interface User {');
    expect(out).toContain('  id: number;');
    expect(out).toContain('  name: string;');
    expect(out.endsWith('}\n')).toBe(true);
  });

  it('emits the ELEMENT type (not the array) for arrays of objects, deriving the singular name', () => {
    const out = generateInterface('Users', [{ id: 1, name: 'Alice' }]);
    expect(out).toContain('export interface Users {');
    expect(out).toContain('  id: number;');
    expect(out).toContain('  name: string;');
    expect(out).not.toContain('Users[]');
  });

  it('marks fields missing from some array elements as optional via "(...) | undefined"', () => {
    const out = generateInterface('Users', [{ id: 1, name: 'Alice' }, { id: 2 }]);
    expect(out).toContain('id: number;');
    expect(out).toContain('name: (string) | undefined;');
  });

  it('emits unknown[] for an empty array', () => {
    expect(generateInterface('Empty', [])).toBe('export type Empty = unknown[];\n');
  });

  it('quotes non-identifier keys with single quotes', () => {
    const out = generateInterface('Weird', { 'some-key': 1 });
    expect(out).toContain("'some-key': number;");
  });

  it('emits null and undefined for null/undefined fields', () => {
    const out = generateInterface('Maybe', { a: null, b: undefined });
    expect(out).toContain('a: null;');
    expect(out).toContain('b: undefined;');
  });
});
