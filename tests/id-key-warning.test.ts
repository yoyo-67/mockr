import { describe, it, expect, afterEach, vi } from 'vitest';
import { mockr } from '../src/index.js';

describe('idKey startup warning', () => {
  let server: Awaited<ReturnType<typeof mockr>> | null = null;
  afterEach(async () => {
    if (server) await server.close();
    server = null;
    vi.restoreAllMocks();
  });

  it('warns when items lack the default idKey "id"', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    server = await mockr({
      port: 0,
      endpoints: [{ url: '/a', data: [{ name: 'no-id' }] }],
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("idKey 'id' not found on items"),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('/a'));
  });

  it('does not warn when items have the default idKey', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    server = await mockr({
      port: 0,
      endpoints: [{ url: '/a', data: [{ id: 1, name: 'ok' }] }],
    });
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining("idKey 'id' not found"),
    );
  });

  it('does not warn when custom idKey matches', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    server = await mockr({
      port: 0,
      endpoints: [{ url: '/a', data: [{ uuid: 'abc' }], idKey: 'uuid' }],
    });
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('idKey'),
    );
  });

  it('warns when custom idKey is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    server = await mockr({
      port: 0,
      endpoints: [{ url: '/a', data: [{ id: 1 }], idKey: 'uuid' }],
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("idKey 'uuid' not found"),
    );
  });

  it('does not warn on empty data array', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    server = await mockr({
      port: 0,
      endpoints: [{ url: '/a', data: [] }],
    });
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('idKey'),
    );
  });

  it('does not warn on record (object) endpoint', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    server = await mockr({
      port: 0,
      endpoints: [{ url: '/a', data: { theme: 'dark' } }],
    });
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('idKey'),
    );
  });
});
