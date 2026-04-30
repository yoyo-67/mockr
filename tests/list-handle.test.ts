import { describe, it, expect } from 'vitest';
import { createListHandle } from '../src/list-handle.js';

interface Item {
  id: number;
  name: string;
  price?: number;
}

describe('ListHandle', () => {
  it('exposes the initial array via the data getter', () => {
    const handle = createListHandle<Item>([{ id: 1, name: 'Apple' }]);
    expect(handle.data).toEqual([{ id: 1, name: 'Apple' }]);
  });

  it('isolates the handle from later mutations of the source array', () => {
    const initial: Item[] = [{ id: 1, name: 'Apple' }];
    const handle = createListHandle<Item>(initial);
    initial.push({ id: 2, name: 'Banana' });
    initial[0].name = 'Mutated';
    expect(handle.data).toEqual([{ id: 1, name: 'Apple' }]);
  });

  it('findById returns the matching item or undefined', () => {
    const handle = createListHandle<Item>([
      { id: 1, name: 'Apple' },
      { id: 2, name: 'Banana' },
    ]);
    expect(handle.findById(1)).toEqual({ id: 1, name: 'Apple' });
    expect(handle.findById(999)).toBeUndefined();
  });

  it('where with object filter', () => {
    const handle = createListHandle<Item>([
      { id: 1, name: 'Apple', price: 1 },
      { id: 2, name: 'Banana', price: 2 },
      { id: 3, name: 'Cherry', price: 1 },
    ]);
    expect(handle.where({ price: 1 })).toEqual([
      { id: 1, name: 'Apple', price: 1 },
      { id: 3, name: 'Cherry', price: 1 },
    ]);
  });

  it('where with predicate', () => {
    const handle = createListHandle<Item>([
      { id: 1, name: 'Apple' },
      { id: 2, name: 'Banana' },
      { id: 3, name: 'Avocado' },
    ]);
    expect(handle.where((i) => i.name.startsWith('A'))).toHaveLength(2);
  });

  it('first returns the first item or undefined', () => {
    expect(createListHandle<Item>([]).first()).toBeUndefined();
    expect(createListHandle<Item>([{ id: 5, name: 'X' }]).first()).toEqual({ id: 5, name: 'X' });
  });

  it('count and has', () => {
    const handle = createListHandle<Item>([
      { id: 1, name: 'Apple' },
      { id: 2, name: 'Banana' },
    ]);
    expect(handle.count()).toBe(2);
    expect(handle.has(1)).toBe(true);
    expect(handle.has(3)).toBe(false);
  });

  it('insert generates an id when missing', () => {
    const handle = createListHandle<Item>([{ id: 1, name: 'Apple' }]);
    const inserted = handle.insert({ name: 'Banana' } as Item);
    expect(inserted.id).toBe(2);
    expect(handle.count()).toBe(2);
  });

  it('insert preserves an explicit id', () => {
    const handle = createListHandle<Item>([{ id: 1, name: 'Apple' }]);
    const inserted = handle.insert({ id: 100, name: 'Banana' });
    expect(inserted.id).toBe(100);
    expect(handle.findById(100)).toBeDefined();
  });

  it('nextId starts at 1 for empty list', () => {
    const handle = createListHandle<Item>([]);
    expect(handle.nextId()).toBe(1);
  });

  it('nextId uses max+1', () => {
    const handle = createListHandle<Item>([
      { id: 5, name: 'A' },
      { id: 9, name: 'B' },
    ]);
    expect(handle.nextId()).toBe(10);
  });

  it('update patches a field', () => {
    const handle = createListHandle<Item>([{ id: 1, name: 'Apple' }]);
    const updated = handle.update(1, { name: 'Apricot' });
    expect(updated).toEqual({ id: 1, name: 'Apricot' });
    expect(handle.findById(1)?.name).toBe('Apricot');
  });

  it('update returns undefined for missing id', () => {
    const handle = createListHandle<Item>([{ id: 1, name: 'Apple' }]);
    expect(handle.update(99, { name: 'X' })).toBeUndefined();
  });

  it('updateMany applies the same patch', () => {
    const handle = createListHandle<Item>([
      { id: 1, name: 'Apple' },
      { id: 2, name: 'Banana' },
    ]);
    const updated = handle.updateMany([1, 2], { name: 'Fruit' });
    expect(updated).toHaveLength(2);
    expect(updated.every((i) => i.name === 'Fruit')).toBe(true);
  });

  it('updateMany supports a function that derives a patch per item', () => {
    const handle = createListHandle<Item>([
      { id: 1, name: 'Apple', price: 1 },
      { id: 2, name: 'Banana', price: 2 },
    ]);
    const updated = handle.updateMany([1, 2], (item) => ({ price: (item.price ?? 0) * 10 }));
    expect(updated.find((i) => i.id === 1)?.price).toBe(10);
    expect(updated.find((i) => i.id === 2)?.price).toBe(20);
  });

  it('patch only applies non-undefined fields', () => {
    const handle = createListHandle<Item>([{ id: 1, name: 'Apple', price: 1 }]);
    const patched = handle.patch(1, { name: undefined, price: 5 });
    expect(patched?.name).toBe('Apple');
    expect(patched?.price).toBe(5);
  });

  it('patch applies defaults unconditionally', () => {
    const handle = createListHandle<Item>([{ id: 1, name: 'Apple' }]);
    const patched = handle.patch(1, {}, { price: 99 });
    expect(patched?.price).toBe(99);
  });

  it('remove deletes by id', () => {
    const handle = createListHandle<Item>([
      { id: 1, name: 'Apple' },
      { id: 2, name: 'Banana' },
    ]);
    expect(handle.remove(1)).toBe(true);
    expect(handle.count()).toBe(1);
    expect(handle.has(1)).toBe(false);
  });

  it('remove returns false for missing id', () => {
    const handle = createListHandle<Item>([{ id: 1, name: 'Apple' }]);
    expect(handle.remove(99)).toBe(false);
  });

  it('clear empties the list', () => {
    const handle = createListHandle<Item>([
      { id: 1, name: 'Apple' },
      { id: 2, name: 'Banana' },
    ]);
    handle.clear();
    expect(handle.count()).toBe(0);
  });

  it('reset restores the initial data after mutations', () => {
    const handle = createListHandle<Item>([{ id: 1, name: 'Apple' }]);
    handle.insert({ id: 2, name: 'Banana' });
    handle.remove(1);
    handle.reset();
    expect(handle.data).toEqual([{ id: 1, name: 'Apple' }]);
  });

  it('reset is deep — restored items can be mutated without leaking into baseline', () => {
    interface Nested {
      id: number;
      meta: { tags: string[] };
    }
    const handle = createListHandle<Nested>([{ id: 1, meta: { tags: ['a'] } }]);
    handle.findById(1)!.meta.tags.push('mutated');
    handle.reset();
    expect(handle.findById(1)!.meta.tags).toEqual(['a']);

    handle.findById(1)!.meta.tags.push('again');
    handle.reset();
    expect(handle.findById(1)!.meta.tags).toEqual(['a']);
  });

  it('respects custom idKey', () => {
    interface Custom {
      slug: string;
      title: string;
    }
    const handle = createListHandle<Custom>(
      [
        { slug: 'a', title: 'Alpha' },
        { slug: 'b', title: 'Beta' },
      ],
      { idKey: 'slug' },
    );
    expect(handle.findById('a')).toEqual({ slug: 'a', title: 'Alpha' });
    expect(handle.has('b')).toBe(true);
    handle.update('a', { title: 'Apex' });
    expect(handle.findById('a')?.title).toBe('Apex');
    handle.remove('b');
    expect(handle.count()).toBe(1);
  });
});
