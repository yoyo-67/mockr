/**
 * `--target <name>` CLI flag.
 *
 * Selects a named entry from `proxy.targets` and uses its URL as the active
 * `proxyTarget`. Mirrors the runtime `server.setProxyTarget(name)` API but
 * fires before the server boots, so `server.url` answers requests against
 * the chosen environment from the very first connection.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mockr } from '../src/index.js';
import type { MockrServer } from '../src/index.js';

const ORIGINAL_ARGV = process.argv;

function setArgv(...flags: string[]) {
  process.argv = ['node', 'server.ts', ...flags];
}

describe('--target CLI flag', () => {
  let server: MockrServer | null = null;

  beforeEach(() => {
    server = null;
  });

  afterEach(async () => {
    process.argv = ORIGINAL_ARGV;
    if (server) await server.close();
  });

  it('resolves the target name to its URL from proxy.targets', async () => {
    setArgv('--target', 'prod', '--port', '0');
    server = await mockr({
      proxy: {
        target: 'https://default.example.com',
        targets: {
          prod: 'https://api.prod.example.com',
          stage: 'https://api.stage.example.com',
        },
      },
    });

    expect(server.proxyTarget).toBe('https://api.prod.example.com');
    expect(server.isProxyEnabled).toBe(true);
  });

  it('selects a different target when a different name is passed', async () => {
    setArgv('--target', 'stage', '--port', '0');
    server = await mockr({
      proxy: {
        target: 'https://default.example.com',
        targets: {
          prod: 'https://api.prod.example.com',
          stage: 'https://api.stage.example.com',
        },
      },
    });

    expect(server.proxyTarget).toBe('https://api.stage.example.com');
  });

  it('throws when target name is not in proxy.targets and lists the valid keys', async () => {
    setArgv('--target', 'devground', '--port', '0');
    await expect(
      mockr({
        proxy: {
          target: 'https://default.example.com',
          targets: {
            prod: 'https://api.prod.example.com',
            stage: 'https://api.stage.example.com',
          },
        },
      }),
    ).rejects.toThrow(/devground/);

    setArgv('--target', 'devground', '--port', '0');
    await expect(
      mockr({
        proxy: {
          target: 'https://default.example.com',
          targets: {
            prod: 'https://api.prod.example.com',
            stage: 'https://api.stage.example.com',
          },
        },
      }),
    ).rejects.toThrow(/prod.*stage|stage.*prod/);
  });

  it('throws when --target is passed but proxy.targets is missing', async () => {
    setArgv('--target', 'prod', '--port', '0');
    await expect(
      mockr({ proxy: { target: 'https://default.example.com' } }),
    ).rejects.toThrow(/proxy\.targets/);
  });

  it('throws when --target is passed but proxy is not configured at all', async () => {
    setArgv('--target', 'prod', '--port', '0');
    await expect(mockr({})).rejects.toThrow(/proxy\.targets/);
  });

  it('throws when both --target and --proxy are passed (conflict)', async () => {
    setArgv('--target', 'prod', '--proxy', 'https://override.example.com', '--port', '0');
    await expect(
      mockr({
        proxy: {
          target: 'https://default.example.com',
          targets: { prod: 'https://api.prod.example.com' },
        },
      }),
    ).rejects.toThrow(/--target.*--proxy|--proxy.*--target/);
  });

  it('keeps the configured proxy.target when --target is omitted', async () => {
    setArgv('--port', '0');
    server = await mockr({
      proxy: {
        target: 'https://default.example.com',
        targets: { prod: 'https://api.prod.example.com' },
      },
    });

    expect(server.proxyTarget).toBe('https://default.example.com');
  });

  it('exposes proxyTargets unchanged regardless of --target choice', async () => {
    setArgv('--target', 'prod', '--port', '0');
    server = await mockr({
      proxy: {
        target: 'https://default.example.com',
        targets: {
          prod: 'https://api.prod.example.com',
          stage: 'https://api.stage.example.com',
        },
      },
    });

    expect(server.proxyTargets).toEqual({
      prod: 'https://api.prod.example.com',
      stage: 'https://api.stage.example.com',
    });
  });
});
