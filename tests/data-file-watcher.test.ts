import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDataFileWatcher } from '../src/data-file-watcher.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('data-file-watcher', () => {
  let dir: string;
  let path: string;
  let watcher: ReturnType<typeof createDataFileWatcher>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mockr-watch-'));
    path = join(dir, 'data.json');
    writeFileSync(path, JSON.stringify([{ id: 1 }]));
    watcher = createDataFileWatcher();
  });

  afterEach(() => {
    watcher.closeAll();
    rmSync(dir, { recursive: true, force: true });
  });

  it('fires onChange with new content when file is rewritten', async () => {
    let received: unknown = null;
    watcher.register(path, (data) => { received = data; });
    await wait(100); // let fs.watch settle on macOS FSEvents
    writeFileSync(path, JSON.stringify([{ id: 2 }]));
    await wait(800);
    expect(received).toEqual([{ id: 2 }]);
  });

  it('debounces rapid writes', async () => {
    let count = 0;
    watcher.register(path, () => { count++; });
    await wait(100);
    writeFileSync(path, JSON.stringify([{ id: 1 }]));
    writeFileSync(path, JSON.stringify([{ id: 2 }]));
    writeFileSync(path, JSON.stringify([{ id: 3 }]));
    await wait(800);
    expect(count).toBeLessThanOrEqual(1);
  });

  it('does not fire onChange on bad JSON; keeps last good', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let received: unknown = null;
    watcher.register(path, (data) => { received = data; });
    await wait(100);
    writeFileSync(path, '{ not valid json');
    await wait(800);
    expect(received).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('closeAll stops watching', async () => {
    let count = 0;
    watcher.register(path, () => { count++; });
    await wait(100);
    watcher.closeAll();
    writeFileSync(path, JSON.stringify([{ id: 99 }]));
    await wait(800);
    expect(count).toBe(0);
  });
});
