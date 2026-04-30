import { describe, it, expect, afterEach } from 'vitest';
import { z } from 'zod';
import { mockr, handler, type MockrServer } from '../src/index.js';

let server: MockrServer;

afterEach(async () => {
  if (server) await server.close();
});

describe('Zod validation', () => {
  it('returns 400 when body fails validation', async () => {
    server = await mockr({
      endpoints: [
        {
          url: '/api/items',
          method: 'POST',
          handler: handler({
            body: z.object({
              name: z.string(),
              price: z.number(),
            }),
            fn: (req) => ({ status: 201, body: req.body }),
          }),
        },
      ],
    });

    const res = await fetch(`${server.url}/api/items`, {
      method: 'POST',
      body: JSON.stringify({ name: 123 }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('passes validated body to handler', async () => {
    server = await mockr({
      endpoints: [
        {
          url: '/api/items',
          method: 'POST',
          handler: handler({
            body: z.object({
              name: z.string(),
              price: z.number(),
            }),
            fn: (req) => ({ status: 201, body: req.body }),
          }),
        },
      ],
    });

    const res = await fetch(`${server.url}/api/items`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Widget', price: 9.99 }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ name: 'Widget', price: 9.99 });
  });

  it('returns 400 when query fails validation', async () => {
    server = await mockr({
      endpoints: [
        {
          url: '/api/items',
          method: 'GET',
          handler: handler({
            query: z.object({
              page: z.string(),
              limit: z.string(),
            }),
            fn: (req) => ({ status: 200, body: { query: req.query } }),
          }),
        },
      ],
    });

    // Missing required query params
    const res = await fetch(`${server.url}/api/items`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details).toBeDefined();
  });

  it('passes validated query to handler', async () => {
    server = await mockr({
      endpoints: [
        {
          url: '/api/items',
          method: 'GET',
          handler: handler({
            query: z.object({
              page: z.string(),
            }),
            fn: (req) => ({ status: 200, body: { page: req.query.page } }),
          }),
        },
      ],
    });

    const res = await fetch(`${server.url}/api/items?page=2`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe('2');
  });

  it('plain function handlers still work', async () => {
    server = await mockr({
      endpoints: [
        {
          url: '/api/ping',
          handler: () => ({ status: 200, body: { pong: true } }),
        },
      ],
    });

    const res = await fetch(`${server.url}/api/ping`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pong).toBe(true);
  });
});
