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
