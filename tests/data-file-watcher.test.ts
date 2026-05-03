import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync, renameSync } from 'node:fs';
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

  it('fires onChange on multiple consecutive writes (re-arms after each event)', async () => {
    const seen: unknown[] = [];
    watcher.register(path, (data) => { seen.push(data); });
    await wait(120);

    writeFileSync(path, JSON.stringify([{ id: 2 }]));
    await wait(800);

    writeFileSync(path, JSON.stringify([{ id: 3 }]));
    await wait(800);

    writeFileSync(path, JSON.stringify([{ id: 4 }]));
    await wait(800);

    // Each write should produce a fresh onChange. Order preserved.
    expect(seen).toEqual([[{ id: 2 }], [{ id: 3 }], [{ id: 4 }]]);
  });

  it('fires onChange on atomic replace (editor save = tmpfile + rename)', async () => {
    const seen: unknown[] = [];
    watcher.register(path, (data) => { seen.push(data); });
    await wait(120);

    // Simulate editor save: write to tmpfile, rename over original.
    const tmp1 = path + '.swp1';
    writeFileSync(tmp1, JSON.stringify([{ id: 2 }]));
    renameSync(tmp1, path);
    await wait(800);

    const tmp2 = path + '.swp2';
    writeFileSync(tmp2, JSON.stringify([{ id: 3 }]));
    renameSync(tmp2, path);
    await wait(800);

    expect(seen).toEqual([[{ id: 2 }], [{ id: 3 }]]);
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
