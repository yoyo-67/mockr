import { describe, it, expect } from 'vitest';
import { createRecordHandle } from '../src/record-handle.js';

describe('RecordHandle', () => {
  it('exposes initial data via the data getter', () => {
    const handle = createRecordHandle({ theme: 'dark', lang: 'en' });
    expect(handle.data).toEqual({ theme: 'dark', lang: 'en' });
  });

  it('isolates the handle from later mutations of the source object', () => {
    const initial = { theme: 'dark', count: 1 };
    const handle = createRecordHandle(initial);
    initial.theme = 'light';
    initial.count = 99;
    expect(handle.data).toEqual({ theme: 'dark', count: 1 });
  });

  it('set merges fields into data without losing existing keys', () => {
    const handle = createRecordHandle({ theme: 'dark', lang: 'en' });
    handle.set({ theme: 'light' });
    expect(handle.data).toEqual({ theme: 'light', lang: 'en' });
  });

  it('set is idempotent across calls', () => {
    const handle = createRecordHandle<{ a: number; b?: number }>({ a: 1 });
    handle.set({ b: 2 });
    handle.set({ a: 3 });
    expect(handle.data).toEqual({ a: 3, b: 2 });
  });

  it('replace overwrites the entire object', () => {
    const handle = createRecordHandle<Record<string, unknown>>({ theme: 'dark', lang: 'en' });
    handle.replace({ theme: 'light' });
    expect(handle.data).toEqual({ theme: 'light' });
  });

  it('reset restores the original object', () => {
    const handle = createRecordHandle({ theme: 'dark', lang: 'en' });
    handle.set({ theme: 'light' });
    handle.replace({ wiped: true } as unknown as { theme: string; lang: string });
    handle.reset();
    expect(handle.data).toEqual({ theme: 'dark', lang: 'en' });
  });

  it('reset uses a deep copy so mutations to nested fields do not leak into baseline', () => {
    interface Config {
      flags: { darkMode: boolean; beta: boolean };
      lang: string;
    }
    const baseline: Config = { flags: { darkMode: true, beta: false }, lang: 'en' };
    const handle = createRecordHandle(baseline);

    // Mutate nested object on the live data
    handle.data.flags.darkMode = false;
    handle.data.flags.beta = true;
    handle.set({ lang: 'fr' });

    handle.reset();
    expect(handle.data).toEqual({ flags: { darkMode: true, beta: false }, lang: 'en' });

    // After reset, mutate again — should not leak into baseline used by next reset
    handle.data.flags.darkMode = false;
    handle.reset();
    expect(handle.data.flags.darkMode).toBe(true);

    // And the original baseline reference itself is untouched
    expect(baseline).toEqual({ flags: { darkMode: true, beta: false }, lang: 'en' });
  });
});
