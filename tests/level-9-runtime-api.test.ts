import { describe, it, expect, afterEach } from 'vitest';
import { mockr } from '../src/index.js';

describe('Level 9 — Runtime APIs', () => {
  let server: Awaited<ReturnType<typeof mockr>> | undefined;
  let targetServer: Awaited<ReturnType<typeof mockr>> | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
    await targetServer?.close();
    targetServer = undefined;
  });

  describe('Endpoint control', () => {
    it('listEndpoints returns all endpoints with info', async () => {
      server = await mockr({
        endpoints: [
          { url: '/api/items', data: [{ id: 1, name: 'Apple' }, { id: 2, name: 'Banana' }] },
          { url: '/api/config', data: { theme: 'dark' } },
          { url: '/api/search', handler: () => ({ status: 200, body: [] }) },
        ],
      });

      const eps = server.listEndpoints();
      expect(eps).toHaveLength(3);

      expect(eps[0]).toEqual({
        url: '/api/items',
        method: 'ALL',
        type: 'data',
        enabled: true,
        itemCount: 2,
      });
      expect(eps[1]).toEqual({
        url: '/api/config',
        method: 'ALL',
        type: 'data',
        enabled: true,
        itemCount: null,
      });
      expect(eps[2]).toEqual({
        url: '/api/search',
        method: 'ALL',
        type: 'handler',
        enabled: true,
        itemCount: null,
      });
    });

    it('listEndpoints shows method when specified', async () => {
      server = await mockr({
        endpoints: [
          { url: '/api/items', method: 'GET', data: { items: [] } },
          { url: '/api/items', method: 'POST', handler: () => ({ status: 201, body: {} }) },
        ],
      });

      const eps = server.listEndpoints();
      expect(eps[0].method).toBe('GET');
      expect(eps[1].method).toBe('POST');
    });

    it('disableEndpoint makes endpoint return 404', async () => {
      server = await mockr({
        endpoints: [
          { url: '/api/items', data: [{ id: 1, name: 'Apple' }] },
        ],
      });

      let res = await fetch(`${server.url}/api/items`);
      expect(res.status).toBe(200);

      server.disableEndpoint('/api/items');

      res = await fetch(`${server.url}/api/items`);
      expect(res.status).toBe(404);

      // listEndpoints reflects disabled state
      const eps = server.listEndpoints();
      expect(eps[0].enabled).toBe(false);
    });

    it('enableEndpoint re-enables a disabled endpoint', async () => {
      server = await mockr({
        endpoints: [
          { url: '/api/items', data: [{ id: 1, name: 'Apple' }] },
        ],
      });

      server.disableEndpoint('/api/items');
      let res = await fetch(`${server.url}/api/items`);
      expect(res.status).toBe(404);

      server.enableEndpoint('/api/items');
      res = await fetch(`${server.url}/api/items`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([{ id: 1, name: 'Apple' }]);
    });

    it('disableEndpoint with method filter only disables matching method', async () => {
      server = await mockr({
        endpoints: [
          { url: '/api/items', method: 'GET', data: { items: [] } },
          { url: '/api/items', method: 'POST', handler: () => ({ status: 201, body: { created: true } }) },
        ],
      });

      server.disableEndpoint('/api/items', 'POST');

      // GET still works
      const getRes = await fetch(`${server.url}/api/items`);
      expect(getRes.status).toBe(200);

      // POST is disabled
      const postRes = await fetch(`${server.url}/api/items`, { method: 'POST' });
      expect(postRes.status).toBe(404);
    });

    it('enableAll and disableAll affect all endpoints', async () => {
      server = await mockr({
        endpoints: [
          { url: '/api/a', data: { a: 1 } },
          { url: '/api/b', data: { b: 2 } },
        ],
      });

      server.disableAll();
      let eps = server.listEndpoints();
      expect(eps.every((e) => !e.enabled)).toBe(true);

      let res = await fetch(`${server.url}/api/a`);
      expect(res.status).toBe(404);

      server.enableAll();
      eps = server.listEndpoints();
      expect(eps.every((e) => e.enabled)).toBe(true);

      res = await fetch(`${server.url}/api/a`);
      expect(res.status).toBe(200);
    });

    it('disabled endpoint falls through to proxy', async () => {
      targetServer = await mockr({
        endpoints: [{ url: '/api/items', data: { source: 'proxy' } }],
      });

      server = await mockr({
        endpoints: [
          { url: '/api/items', data: { source: 'local' } },
        ],
        proxy: { target: targetServer.url },
      });

      // Local endpoint serves local data
      let res = await fetch(`${server.url}/api/items`);
      expect(await res.json()).toEqual({ source: 'local' });

      // Disable local → falls through to proxy
      server.disableEndpoint('/api/items');
      res = await fetch(`${server.url}/api/items`);
      expect(await res.json()).toEqual({ source: 'proxy' });
    });

    it('itemCount reflects current data length', async () => {
      server = await mockr({
        endpoints: [
          { url: '/api/items', data: [{ id: 1, name: 'Apple' }] },
        ],
      });

      expect(server.listEndpoints()[0].itemCount).toBe(1);

      server.endpoint('/api/items').insert({ name: 'Banana' });
      expect(server.listEndpoints()[0].itemCount).toBe(2);

      server.endpoint('/api/items').clear();
      expect(server.listEndpoints()[0].itemCount).toBe(0);
    });
  });

  describe('Proxy control', () => {
    it('isProxyEnabled and proxyTarget reflect config', async () => {
      server = await mockr({
        proxy: { target: 'https://example.com' },
      });

      expect(server.isProxyEnabled).toBe(true);
      expect(server.proxyTarget).toBe('https://example.com');
    });

    it('no proxy config means disabled and null target', async () => {
      server = await mockr({
        endpoints: [{ url: '/api/a', data: {} }],
      });

      expect(server.isProxyEnabled).toBe(false);
      expect(server.proxyTarget).toBeNull();
    });

    it('disableProxy stops forwarding to target', async () => {
      targetServer = await mockr({
        endpoints: [{ url: '/api/remote', data: { remote: true } }],
      });

      server = await mockr({
        proxy: { target: targetServer.url },
      });

      let res = await fetch(`${server.url}/api/remote`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ remote: true });

      server.disableProxy();
      expect(server.isProxyEnabled).toBe(false);

      res = await fetch(`${server.url}/api/remote`);
      expect(res.status).toBe(404);
    });

    it('enableProxy re-enables forwarding', async () => {
      targetServer = await mockr({
        endpoints: [{ url: '/api/remote', data: { remote: true } }],
      });

      server = await mockr({
        proxy: { target: targetServer.url },
      });

      server.disableProxy();
      let res = await fetch(`${server.url}/api/remote`);
      expect(res.status).toBe(404);

      server.enableProxy();
      expect(server.isProxyEnabled).toBe(true);

      res = await fetch(`${server.url}/api/remote`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ remote: true });
    });
  });

  describe('Scenario info', () => {
    it('listScenarios returns scenario names', async () => {
      server = await mockr({
        endpoints: [{ url: '/api/items', data: [] as { id: number; name: string }[] }],
        scenarios: {
          seeded: (s) => { s.endpoint('/api/items').insert({ name: 'Apple' }); },
          empty: () => {},
          broken: (s) => {
            s.endpoint('/api/items').handler = () => ({ status: 500, body: { error: 'broken' } });
          },
        },
      });

      const names = server.listScenarios();
      expect(names).toEqual(['seeded', 'empty', 'broken']);
    });

    it('activeScenario is null initially', async () => {
      server = await mockr({
        endpoints: [{ url: '/api/items', data: [] as { id: number }[] }],
        scenarios: { seeded: () => {} },
      });

      expect(server.activeScenario).toBeNull();
    });

    it('activeScenario updates when scenario is applied', async () => {
      server = await mockr({
        endpoints: [{ url: '/api/items', data: [] as { id: number; name: string }[] }],
        scenarios: {
          seeded: (s) => { s.endpoint('/api/items').insert({ name: 'Apple' }); },
          empty: () => {},
        },
      });

      await server.scenario('seeded');
      expect(server.activeScenario).toBe('seeded');

      await server.scenario('empty');
      expect(server.activeScenario).toBe('empty');
    });

    it('listScenarios is empty when no scenarios configured', async () => {
      server = await mockr({
        endpoints: [{ url: '/api/items', data: {} }],
      });

      expect(server.listScenarios()).toEqual([]);
    });
  });
});
