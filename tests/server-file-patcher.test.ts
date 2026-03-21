import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  addEndpointToServerFile,
  removeEndpointFromServerFile,
  updateUrlInServerFile,
  changeToHandlerInServerFile,
} from '../src/server-file-patcher.js';

describe('Server file patcher', () => {
  let tmpDir: string;
  let serverFile: string;

  const TEMPLATE = `import { mockr } from 'mockr'

type Endpoints = {
  '/api/existing': { id: number }
}

const server = await mockr<Endpoints>({
  port: 0,
  endpoints: [
    { url: '/api/existing', data: [{ id: 1 }] },
  ],
})
`;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mockr-patcher-'));
    serverFile = join(tmpDir, 'server.ts');
    await writeFile(serverFile, TEMPLATE, 'utf-8');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // addEndpointToServerFile

  it('adds dataFile entry to endpoints array', async () => {
    await addEndpointToServerFile(serverFile, {
      url: '/api/items',
      method: 'GET',
      filePath: './mocks/api-items.json',
    });

    const src = await readFile(serverFile, 'utf-8');
    expect(src).toContain("dataFile: './mocks/api-items.json'");
    expect(src).toContain("url: '/api/items'");
    // Should NOT contain bodyFile
    expect(src).not.toContain('bodyFile');
  });

  it('always uses dataFile (never bodyFile)', async () => {
    await addEndpointToServerFile(serverFile, {
      url: '/api/config',
      method: 'GET',
      filePath: './mocks/config.json',
    });

    const src = await readFile(serverFile, 'utf-8');
    expect(src).toContain('dataFile');
    expect(src).not.toContain('bodyFile');
  });

  it('adds type import and Endpoints entry when typesFile provided', async () => {
    const typesFile = join(tmpDir, 'mocks', 'api-items.d.ts');
    await writeFile(join(tmpDir, 'mocks', 'api-items.d.ts'), 'export interface ApiItems { id: number }', 'utf-8').catch(() => {});
    // Create the dir
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(tmpDir, 'mocks'), { recursive: true });
    await writeFile(typesFile, 'export interface ApiItems { id: number }', 'utf-8');

    await addEndpointToServerFile(serverFile, {
      url: '/api/items',
      method: 'GET',
      filePath: './mocks/api-items.json',
      typesFile,
    });

    const src = await readFile(serverFile, 'utf-8');
    // Should have type import
    expect(src).toContain('import type');
    expect(src).toContain('ApiItems');
    // Should have Endpoints type entry
    expect(src).toContain("'/api/items': ApiItems");
  });

  it('skips if URL already exists in file', async () => {
    await addEndpointToServerFile(serverFile, {
      url: '/api/existing', // already in template
      method: 'GET',
      filePath: './mocks/existing.json',
    });

    const src = await readFile(serverFile, 'utf-8');
    // Should not duplicate — same count as original template
    const original = TEMPLATE;
    const originalCount = (original.match(/api\/existing/g) || []).length;
    const count = (src.match(/api\/existing/g) || []).length;
    expect(count).toBe(originalCount);
  });

  // removeEndpointFromServerFile

  it('removes endpoint entry from array', async () => {
    // First add one
    await addEndpointToServerFile(serverFile, {
      url: '/api/items',
      method: 'GET',
      filePath: './mocks/api-items.json',
    });
    let src = await readFile(serverFile, 'utf-8');
    expect(src).toContain("'/api/items'");

    // Then remove it
    await removeEndpointFromServerFile(serverFile, '/api/items');
    src = await readFile(serverFile, 'utf-8');
    expect(src).not.toContain("'/api/items'");
  });

  it('removes type entry and import on delete', async () => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(tmpDir, 'mocks'), { recursive: true });
    const typesFile = join(tmpDir, 'mocks', 'api-items.d.ts');
    await writeFile(typesFile, 'export interface ApiItems { id: number }', 'utf-8');

    await addEndpointToServerFile(serverFile, {
      url: '/api/items',
      method: 'GET',
      filePath: './mocks/api-items.json',
      typesFile,
    });

    let src = await readFile(serverFile, 'utf-8');
    expect(src).toContain('ApiItems');

    await removeEndpointFromServerFile(serverFile, '/api/items');
    src = await readFile(serverFile, 'utf-8');
    expect(src).not.toContain('ApiItems');
    expect(src).not.toContain("'/api/items'");
  });

  // updateUrlInServerFile

  it('replaces URL in all locations', async () => {
    await updateUrlInServerFile(serverFile, '/api/existing', '/api/v1/items/**');

    const src = await readFile(serverFile, 'utf-8');
    expect(src).toContain("'/api/v1/items/**'");
    expect(src).not.toContain("'/api/existing'");
  });

  // changeToHandlerInServerFile

  it('changes dataFile to handler', async () => {
    await addEndpointToServerFile(serverFile, {
      url: '/api/items',
      method: 'GET',
      filePath: './mocks/api-items.json',
    });

    await changeToHandlerInServerFile(serverFile, '/api/items');

    const src = await readFile(serverFile, 'utf-8');
    expect(src).toContain('handler');
    expect(src).not.toContain('dataFile');
  });
});
