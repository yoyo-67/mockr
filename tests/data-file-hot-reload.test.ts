import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mockr } from '../src/index.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('dataFile hot-reload', () => {
  let dir: string;
  let path: string;
  let server: Awaited<ReturnType<typeof mockr>>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mockr-hr-'));
    path = join(dir, 'items.json');
    writeFileSync(path, JSON.stringify([{ id: 1, name: 'a' }]));
    server = await mockr({
      port: 0,
      endpoints: [{ url: '/api/items', dataFile: path }],
    });
    await wait(120); // let fs.watch settle
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves new content after file change', async () => {
    const before = await fetch(`${server.url}/api/items`).then((r) => r.json());
    expect(before).toEqual([{ id: 1, name: 'a' }]);

    writeFileSync(
      path,
      JSON.stringify([
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ]),
    );
    await wait(800);

    const after = await fetch(`${server.url}/api/items`).then((r) => r.json());
    expect(after).toEqual([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);
  });

  it('reloads record (object) dataFile and serves new content', async () => {
    const cfgPath = join(dir, 'config.json');
    writeFileSync(cfgPath, JSON.stringify({ theme: 'dark', lang: 'en' }));
    const cfgServer = await mockr({
      port: 0,
      endpoints: [{ url: '/api/config', dataFile: cfgPath }],
    });
    await wait(120);

    const before = await fetch(`${cfgServer.url}/api/config`).then((r) => r.json());
    expect(before).toEqual({ theme: 'dark', lang: 'en' });

    writeFileSync(cfgPath, JSON.stringify({ theme: 'light', lang: 'fr', beta: true }));
    await wait(800);

    const after = await fetch(`${cfgServer.url}/api/config`).then((r) => r.json());
    expect(after).toEqual({ theme: 'light', lang: 'fr', beta: true });

    await cfgServer.close();
  });

  it('drops in-memory mutations on reload (reset semantics)', async () => {
    await fetch(`${server.url}/api/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'temp' }),
    });
    const mid = await fetch(`${server.url}/api/items`).then((r) => r.json());
    expect(mid).toHaveLength(2);

    writeFileSync(
      path,
      JSON.stringify([
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ]),
    );
    await wait(800);

    const after = await fetch(`${server.url}/api/items`).then((r) => r.json());
    expect(after).toEqual([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);
  });
});
