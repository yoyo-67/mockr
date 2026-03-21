import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  addEndpointToServerFile,
  removeEndpointFromServerFile,
  updateUrlInServerFile,
  changeToHandlerInServerFile,
} from '../src/server-file-patcher.js';

/** Check if string contains text regardless of quote style */
function containsText(src: string, text: string): boolean {
  // Normalize quotes for comparison
  const norm = (s: string) => s.replace(/['"]/g, '');
  return norm(src).includes(norm(text));
}

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

  it('adds dataFile entry to endpoints array', async () => {
    await addEndpointToServerFile(serverFile, {
      url: '/api/items',
      method: 'GET',
      filePath: './mocks/api-items.json',
    });

    const src = await readFile(serverFile, 'utf-8');
    expect(containsText(src, 'dataFile')).toBe(true);
    expect(containsText(src, 'api-items.json')).toBe(true);
    expect(containsText(src, '/api/items')).toBe(true);
    expect(containsText(src, 'bodyFile')).toBe(false);
  });

  it('always uses dataFile (never bodyFile)', async () => {
    await addEndpointToServerFile(serverFile, {
      url: '/api/config',
      method: 'GET',
      filePath: './mocks/config.json',
    });

    const src = await readFile(serverFile, 'utf-8');
    expect(containsText(src, 'dataFile')).toBe(true);
    expect(containsText(src, 'bodyFile')).toBe(false);
  });

  it('adds type import and Endpoints entry when typesFile provided', async () => {
    await mkdir(join(tmpDir, 'mocks'), { recursive: true });
    const typesFile = join(tmpDir, 'mocks', 'api-items.d.ts');
    await writeFile(typesFile, 'export interface ApiItems { id: number }', 'utf-8');

    await addEndpointToServerFile(serverFile, {
      url: '/api/items',
      method: 'GET',
      filePath: './mocks/api-items.json',
      typesFile,
    });

    const src = await readFile(serverFile, 'utf-8');
    expect(containsText(src, 'import type')).toBe(true);
    expect(containsText(src, 'ApiItems')).toBe(true);
    expect(containsText(src, '/api/items')).toBe(true);
  });

  it('skips if URL already exists in file', async () => {
    await addEndpointToServerFile(serverFile, {
      url: '/api/existing',
      method: 'GET',
      filePath: './mocks/existing.json',
    });

    const src = await readFile(serverFile, 'utf-8');
    const original = TEMPLATE;
    // Normalize both for fair comparison (prettier may reformat)
    const origCount = (original.replace(/['"]/g, '').match(/api\/existing/g) || []).length;
    const newCount = (src.replace(/['"]/g, '').match(/api\/existing/g) || []).length;
    expect(newCount).toBe(origCount);
  });

  it('removes endpoint entry from array', async () => {
    await addEndpointToServerFile(serverFile, {
      url: '/api/items',
      method: 'GET',
      filePath: './mocks/api-items.json',
    });
    let src = await readFile(serverFile, 'utf-8');
    expect(containsText(src, '/api/items')).toBe(true);

    await removeEndpointFromServerFile(serverFile, '/api/items');
    src = await readFile(serverFile, 'utf-8');
    expect(containsText(src, 'api-items')).toBe(false);
  });

  it('removes type entry and import on delete', async () => {
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
    expect(containsText(src, 'ApiItems')).toBe(true);

    await removeEndpointFromServerFile(serverFile, '/api/items');
    src = await readFile(serverFile, 'utf-8');
    expect(containsText(src, 'ApiItems')).toBe(false);
  });

  it('replaces URL in all locations', async () => {
    await updateUrlInServerFile(serverFile, '/api/existing', '/api/v1/items/**');

    const src = await readFile(serverFile, 'utf-8');
    expect(containsText(src, '/api/v1/items/**')).toBe(true);
    expect(containsText(src, '/api/existing')).toBe(false);
  });

  it('changes dataFile to handler', async () => {
    await addEndpointToServerFile(serverFile, {
      url: '/api/items',
      method: 'GET',
      filePath: './mocks/api-items.json',
    });

    await changeToHandlerInServerFile(serverFile, '/api/items');

    const src = await readFile(serverFile, 'utf-8');
    expect(containsText(src, 'handler')).toBe(true);
    expect(containsText(src, 'dataFile')).toBe(false);
  });
});
