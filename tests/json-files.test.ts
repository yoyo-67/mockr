import { describe, it, expect, afterEach } from 'vitest';
import { mockr } from '../src/index.js';
import { writeFile, readFile, unlink, mkdir } from 'node:fs/promises';

const FIXTURES_DIR = '/tmp/mockr-test-fixtures';

describe('JSON files', () => {
  let server: Awaited<ReturnType<typeof mockr>>;
  afterEach(async () => { await server?.close(); });

  it('loads data from fixtureFile', async () => {
    await mkdir(FIXTURES_DIR, { recursive: true });
    const fixturePath = `${FIXTURES_DIR}/mock-data.json`;
    await writeFile(fixturePath, JSON.stringify({
      '/api/items': [
        { id: 1, name: 'Apple' },
        { id: 2, name: 'Banana' },
      ],
      '/api/config': { theme: 'dark', lang: 'en' },
    }));

    server = await mockr({ fixtureFile: fixturePath });

    // Array → data endpoint with CRUD
    const items = await fetch(`${server.url}/api/items`).then(r => r.json());
    expect(items).toEqual([{ id: 1, name: 'Apple' }, { id: 2, name: 'Banana' }]);

    // Object → static body endpoint
    const config = await fetch(`${server.url}/api/config`).then(r => r.json());
    expect(config).toEqual({ theme: 'dark', lang: 'en' });

    // Data endpoint supports CRUD
    const created = await fetch(`${server.url}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Cherry' }),
    }).then(r => r.json());
    expect(created).toEqual({ id: 3, name: 'Cherry' });

    await unlink(fixturePath).catch(() => {});
  });

  it('loads dataFile for individual endpoint', async () => {
    await mkdir(FIXTURES_DIR, { recursive: true });
    const dataPath = `${FIXTURES_DIR}/items.json`;
    await writeFile(dataPath, JSON.stringify([
      { id: 1, name: 'Apple' },
    ]));

    server = await mockr({
      endpoints: [
        { url: '/api/items', dataFile: dataPath },
      ],
    });

    const items = await fetch(`${server.url}/api/items`).then(r => r.json());
    expect(items).toEqual([{ id: 1, name: 'Apple' }]);

    await unlink(dataPath).catch(() => {});
  });

  it('loads dataFile for object (static endpoint)', async () => {
    await mkdir(FIXTURES_DIR, { recursive: true });
    const bodyPath = `${FIXTURES_DIR}/config.json`;
    await writeFile(bodyPath, JSON.stringify({ theme: 'dark' }));

    server = await mockr({
      endpoints: [
        { url: '/api/config', dataFile: bodyPath },
      ],
    });

    const config = await fetch(`${server.url}/api/config`).then(r => r.json());
    expect(config).toEqual({ theme: 'dark' });

    await unlink(bodyPath).catch(() => {});
  });

  it('saves snapshot to file', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/items', data: [{ id: 1, name: 'Apple' }] },
      ],
    });

    const handle = server.endpoint('/api/items');
    handle.insert({ id: handle.nextId(), name: 'Banana' });

    const snapshotPath = `${FIXTURES_DIR}/snapshot.json`;
    await mkdir(FIXTURES_DIR, { recursive: true });
    await server.save(snapshotPath);

    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf-8'));
    expect(snapshot['/api/items']).toEqual([
      { id: 1, name: 'Apple' },
      { id: 2, name: 'Banana' },
    ]);

    await unlink(snapshotPath).catch(() => {});
  });

  it('dataFile re-reads from disk on each request (live reload)', async () => {
    await mkdir(FIXTURES_DIR, { recursive: true });
    const dataPath = `${FIXTURES_DIR}/live.json`;
    await writeFile(dataPath, JSON.stringify([{ id: 1, name: 'Original' }]));

    server = await mockr({
      endpoints: [
        { url: '/api/live', dataFile: dataPath },
      ],
    });
    await new Promise((r) => setTimeout(r, 120)); // let fs.watch settle

    // First request — original data
    const r1 = await fetch(`${server.url}/api/live`).then(r => r.json());
    expect(r1).toEqual([{ id: 1, name: 'Original' }]);

    // Edit the file on disk
    await writeFile(dataPath, JSON.stringify([{ id: 1, name: 'Updated' }, { id: 2, name: 'New' }]));
    await new Promise((r) => setTimeout(r, 800)); // wait for watcher debounce + reload

    // Second request — picks up the change without restart
    const r2 = await fetch(`${server.url}/api/live`).then(r => r.json());
    expect(r2).toEqual([{ id: 1, name: 'Updated' }, { id: 2, name: 'New' }]);

    await unlink(dataPath).catch(() => {});
  });

  it('dataFile re-reads objects from disk too', async () => {
    await mkdir(FIXTURES_DIR, { recursive: true });
    const dataPath = `${FIXTURES_DIR}/config-live.json`;
    await writeFile(dataPath, JSON.stringify({ theme: 'dark' }));

    server = await mockr({
      endpoints: [
        { url: '/api/config-live', dataFile: dataPath },
      ],
    });
    await new Promise((r) => setTimeout(r, 120));

    const r1 = await fetch(`${server.url}/api/config-live`).then(r => r.json());
    expect(r1).toEqual({ theme: 'dark' });

    // Edit
    await writeFile(dataPath, JSON.stringify({ theme: 'light', lang: 'en' }));
    await new Promise((r) => setTimeout(r, 800));

    // Picks up change
    const r2 = await fetch(`${server.url}/api/config-live`).then(r => r.json());
    expect(r2).toEqual({ theme: 'light', lang: 'en' });

    await unlink(dataPath).catch(() => {});
  });

  it('saves individual endpoint data', async () => {
    server = await mockr({
      endpoints: [
        { url: '/api/items', data: [{ id: 1, name: 'Apple' }] },
      ],
    });

    const savePath = `${FIXTURES_DIR}/items-save.json`;
    await mkdir(FIXTURES_DIR, { recursive: true });
    await server.endpoint('/api/items').save(savePath);

    const saved = JSON.parse(await readFile(savePath, 'utf-8'));
    expect(saved).toEqual([{ id: 1, name: 'Apple' }]);

    await unlink(savePath).catch(() => {});
  });
});
