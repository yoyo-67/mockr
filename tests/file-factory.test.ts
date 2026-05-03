import { describe, it, expect } from 'vitest';
import { file, isFileRef, getFilePath, FILE_REF_BRAND } from '../src/file.js';

describe('file factory', () => {
  it('returns a value branded with FILE_REF_BRAND', () => {
    const ref = file('./x.json');

    expect((ref as Record<symbol, unknown>)[FILE_REF_BRAND]).toBe(true);
  });

  it('isFileRef returns true for factory output', () => {
    const ref = file('./x.json');

    expect(isFileRef(ref)).toBe(true);
  });

  it('isFileRef returns false for a plain string', () => {
    expect(isFileRef('./x.json')).toBe(false);
  });

  it('isFileRef returns false for an arbitrary object', () => {
    expect(isFileRef({})).toBe(false);
    expect(isFileRef({ path: './x.json' })).toBe(false);
  });

  it('isFileRef returns false for null and primitives', () => {
    expect(isFileRef(null)).toBe(false);
    expect(isFileRef(undefined)).toBe(false);
    expect(isFileRef(42)).toBe(false);
  });

  it('getFilePath returns the original input path unchanged', () => {
    const ref = file('./relative/path.json');
    expect(getFilePath(ref)).toBe('./relative/path.json');

    const absoluteRef = file('/absolute/path.json');
    expect(getFilePath(absoluteRef)).toBe('/absolute/path.json');

    const urlRef = file(new URL('./data.json', 'file:///root/').pathname);
    expect(getFilePath(urlRef)).toBe('/root/data.json');
  });

  it('exposes path via the .path field', () => {
    const ref = file('./x.json');
    expect(ref.path).toBe('./x.json');
  });

  it('uses Symbol.for so the brand is shared across realms', () => {
    expect(FILE_REF_BRAND).toBe(Symbol.for('mockr.FileRef'));
  });

  it('runtime identity: same path passed in is preserved through the ref', () => {
    const path = './some/deeply/nested/data.json';
    const ref = file<{ a: 1 }>(path);
    expect(getFilePath(ref)).toBe(path);
  });
});
