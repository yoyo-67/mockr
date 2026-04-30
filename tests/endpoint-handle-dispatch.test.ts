import { describe, it, expect } from 'vitest';
import { createEndpointHandle } from '../src/endpoint-handle.js';
import type { ListHandle } from '../src/list-handle.js';
import type { RecordHandle } from '../src/record-handle.js';

interface Item {
  id: number;
  name: string;
}

interface Config {
  theme: string;
  lang: string;
}

function isListHandle<T>(h: unknown): h is ListHandle<T> {
  return typeof h === 'object' && h !== null && 'findById' in h && 'insert' in h;
}

function isRecordHandle<T extends object>(h: unknown): h is RecordHandle<T> {
  return typeof h === 'object' && h !== null && 'set' in h && 'replace' in h;
}

describe('createEndpointHandle dispatch', () => {
  it('returns a ListHandle for array data', () => {
    const handle = createEndpointHandle<Item[]>([{ id: 1, name: 'Apple' }]);
    expect(isListHandle<Item>(handle)).toBe(true);
    if (!isListHandle<Item>(handle)) throw new Error('expected ListHandle');
    expect(handle.findById(1)).toEqual({ id: 1, name: 'Apple' });
  });

  it('returns a ListHandle for empty arrays', () => {
    const handle = createEndpointHandle<Item[]>([]);
    expect(isListHandle<Item>(handle)).toBe(true);
    if (!isListHandle<Item>(handle)) throw new Error('expected ListHandle');
    expect(handle.count()).toBe(0);
  });

  it('returns a RecordHandle for object data', () => {
    const handle = createEndpointHandle<Config>({ theme: 'dark', lang: 'en' });
    expect(isRecordHandle<Config>(handle)).toBe(true);
    if (!isRecordHandle<Config>(handle)) throw new Error('expected RecordHandle');
    expect(handle.data).toEqual({ theme: 'dark', lang: 'en' });
  });

  it('forwards idKey option to the ListHandle', () => {
    interface SlugItem { slug: string; title: string }
    const handle = createEndpointHandle<SlugItem[]>(
      [{ slug: 'a', title: 'Alpha' }],
      { idKey: 'slug' },
    );
    if (!isListHandle<SlugItem>(handle)) throw new Error('expected ListHandle');
    expect(handle.findById('a')).toEqual({ slug: 'a', title: 'Alpha' });
  });
});
