/**
 * `ctx.file(path)` — stream a file as the response body, bypassing the
 * JSON/buffer pipeline. The Forge-viewer case: intercept a
 * `GET .../fragments_extra.fl` and serve a substitute binary file, streamed,
 * with no UTF-8/JSON coercion (the dealbreaker that makes `sendRaw` unusable
 * for multi-GB `.fl` files). Also covers the static `{ url, file }` form.
 */
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mockr } from '../src/index.js';
import type { MockrServer } from '../src/index.js';
import { mockGroup } from '../src/mock-group.js';

type E = {
  '/forge-lean/file/:urn/:level/fragments_extra.fl': unknown;
  '/img': unknown;
  '/thing': unknown;
  '/ranged': unknown;
  '/missing': unknown;
  '/static-asset': unknown;
  '/static-ranged': unknown;
  '/bad': unknown;
};

describe('ctx.file — streamed file responses', () => {
  let server: MockrServer<E> | undefined;
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mockr-file-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  afterEach(async () => { try { await server?.close(); } catch { /* never started */ } server = undefined; });

  it('streams raw binary bytes byte-for-byte (no UTF-8 coercion)', async () => {
    // Bytes that are invalid/lossy under UTF-8 round-tripping.
    const bytes = Buffer.from([0xff, 0xfe, 0x00, 0x80, 0x01, 0xc0, 0xff]);
    const filePath = join(dir, 'fragments_extra.fl');
    writeFileSync(filePath, bytes);

    server = await mockr({
      endpoints: mockGroup<E>()
        .get('/forge-lean/file/:urn/:level/fragments_extra.fl', (_req, ctx) => ctx.file(filePath))
        .done(),
    });

    const res = await fetch(`${server.url}/forge-lean/file/abc123/level-0/fragments_extra.fl`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe(String(bytes.length));
    expect(res.headers.get('content-type')).toBe('application/octet-stream');

    const received = Buffer.from(await res.arrayBuffer());
    expect(received.equals(bytes)).toBe(true);
  });

  it('derives Content-Type from the file extension', async () => {
    const filePath = join(dir, 'pic.png');
    writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    server = await mockr({
      endpoints: mockGroup<E>().get('/img', (_req, ctx) => ctx.file(filePath)).done(),
    });
    const res = await fetch(`${server.url}/img`);
    expect(res.headers.get('content-type')).toBe('image/png');
    await res.arrayBuffer();
  });

  it('lets an explicit Content-Type header override the extension default', async () => {
    const filePath = join(dir, 'thing.png');
    writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    server = await mockr({
      endpoints: mockGroup<E>()
        .get('/thing', (_req, ctx) => ctx.file(filePath, { headers: { 'Content-Type': 'application/wasm' } }))
        .done(),
    });
    const res = await fetch(`${server.url}/thing`);
    expect(res.headers.get('content-type')).toBe('application/wasm');
    await res.arrayBuffer();
  });

  describe('Range requests', () => {
    // Deterministic 1000-byte file: byte i === i % 256.
    const TOTAL = 1000;
    let rangePath: string;
    let full: Buffer;

    beforeAll(() => {
      full = Buffer.from(Array.from({ length: TOTAL }, (_, i) => i % 256));
      rangePath = join(dir, 'ranged.bin');
      writeFileSync(rangePath, full);
    });

    async function serveRanged() {
      return mockr({
        endpoints: mockGroup<E>().get('/ranged', (_req, ctx) => ctx.file(rangePath)).done(),
      });
    }

    it('serves a closed range as 206 Partial Content', async () => {
      server = await serveRanged();
      const res = await fetch(`${server.url}/ranged`, { headers: { Range: 'bytes=100-199' } });
      expect(res.status).toBe(206);
      expect(res.headers.get('content-range')).toBe(`bytes 100-199/${TOTAL}`);
      expect(res.headers.get('content-length')).toBe('100');
      expect(res.headers.get('accept-ranges')).toBe('bytes');
      const received = Buffer.from(await res.arrayBuffer());
      expect(received.equals(full.subarray(100, 200))).toBe(true);
    });

    it('serves an open-ended range (bytes=N-) to EOF', async () => {
      server = await serveRanged();
      const res = await fetch(`${server.url}/ranged`, { headers: { Range: 'bytes=900-' } });
      expect(res.status).toBe(206);
      expect(res.headers.get('content-range')).toBe(`bytes 900-999/${TOTAL}`);
      expect(res.headers.get('content-length')).toBe('100');
      const received = Buffer.from(await res.arrayBuffer());
      expect(received.equals(full.subarray(900, 1000))).toBe(true);
    });

    it('serves a suffix range (bytes=-N) as the last N bytes', async () => {
      server = await serveRanged();
      const res = await fetch(`${server.url}/ranged`, { headers: { Range: 'bytes=-50' } });
      expect(res.status).toBe(206);
      expect(res.headers.get('content-range')).toBe(`bytes 950-999/${TOTAL}`);
      const received = Buffer.from(await res.arrayBuffer());
      expect(received.equals(full.subarray(950, 1000))).toBe(true);
    });

    it('clamps an end past EOF, still 206', async () => {
      server = await serveRanged();
      const res = await fetch(`${server.url}/ranged`, { headers: { Range: 'bytes=990-99999' } });
      expect(res.status).toBe(206);
      expect(res.headers.get('content-range')).toBe(`bytes 990-999/${TOTAL}`);
      await res.arrayBuffer();
    });

    it('returns 416 when start is beyond EOF', async () => {
      server = await serveRanged();
      const res = await fetch(`${server.url}/ranged`, { headers: { Range: 'bytes=2000-3000' } });
      expect(res.status).toBe(416);
      expect(res.headers.get('content-range')).toBe(`bytes */${TOTAL}`);
      await res.arrayBuffer();
    });

    it('ignores a malformed Range and serves the full 200 body', async () => {
      server = await serveRanged();
      const res = await fetch(`${server.url}/ranged`, { headers: { Range: 'bytes=abc' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-length')).toBe(String(TOTAL));
      await res.arrayBuffer();
    });
  });

  it('returns 404 when the file does not exist', async () => {
    server = await mockr({
      endpoints: mockGroup<E>().get('/missing', (_req, ctx) => ctx.file(join(dir, 'nope.bin'))).done(),
    });
    const res = await fetch(`${server.url}/missing`);
    expect(res.status).toBe(404);
    await res.arrayBuffer();
  });

  describe('static { url, file } form', () => {
    it('serves the configured file with no handler boilerplate', async () => {
      const p = join(dir, 'static-asset.bin');
      const bytes = Buffer.from([0x10, 0x20, 0x30, 0x40, 0x50]);
      writeFileSync(p, bytes);
      server = await mockr<E>({ endpoints: [{ url: '/static-asset', file: p }] });
      const res = await fetch(`${server.url}/static-asset`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-length')).toBe(String(bytes.length));
      const received = Buffer.from(await res.arrayBuffer());
      expect(received.equals(bytes)).toBe(true);
    });

    it('honors a Range request', async () => {
      const p = join(dir, 'static-ranged.bin');
      const bytes = Buffer.from(Array.from({ length: 500 }, (_, i) => i % 256));
      writeFileSync(p, bytes);
      server = await mockr<E>({ endpoints: [{ url: '/static-ranged', file: p }] });
      const res = await fetch(`${server.url}/static-ranged`, { headers: { Range: 'bytes=10-19' } });
      expect(res.status).toBe(206);
      expect(res.headers.get('content-range')).toBe('bytes 10-19/500');
      const received = Buffer.from(await res.arrayBuffer());
      expect(received.equals(bytes.subarray(10, 20))).toBe(true);
    });

    it('answers HEAD with headers and no body', async () => {
      const p = join(dir, 'static-head.bin');
      const bytes = Buffer.from(Array.from({ length: 300 }, (_, i) => i % 256));
      writeFileSync(p, bytes);
      server = await mockr<E>({ endpoints: [{ url: '/static-asset', file: p }] });
      const res = await fetch(`${server.url}/static-asset`, { method: 'HEAD' });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-length')).toBe(String(bytes.length));
      expect(res.headers.get('accept-ranges')).toBe('bytes');
      const received = Buffer.from(await res.arrayBuffer());
      expect(received.length).toBe(0);
    });

    it('keeps serving after a client aborts mid-stream', async () => {
      const p = join(dir, 'static-abort.bin');
      writeFileSync(p, Buffer.alloc(2 * 1024 * 1024, 7)); // 2 MB
      server = await mockr<E>({ endpoints: [{ url: '/static-asset', file: p }] });

      const ac = new AbortController();
      const aborted = fetch(`${server.url}/static-asset`, { signal: ac.signal });
      ac.abort();
      await expect(aborted).rejects.toThrow();

      // Server is not wedged by the aborted stream.
      const res = await fetch(`${server.url}/static-asset`);
      expect(res.status).toBe(200);
      expect(Buffer.from(await res.arrayBuffer()).length).toBe(2 * 1024 * 1024);
    });

    it('throws at boot when file is combined with handler', async () => {
      await expect(
        // @ts-expect-error — file + handler is a conflicting form
        mockr({ endpoints: [{ url: '/bad', file: './a.bin', handler: () => ({ body: {} }) }] }),
      ).rejects.toThrow();
    });
  });
});
