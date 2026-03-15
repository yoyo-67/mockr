// Auth API — middleware (auth, delay, logging), scenarios, runtime middleware.

import { mockr, auth, delay, logger } from '../../src/index.js';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

type Endpoints = {
  '/internal/users': User;
};

const server = await mockr<Endpoints>({
  port: 3003,
  middleware: [
    logger(),
    delay({ min: 50, max: 150 }),
    auth({
      type: 'bearer',
      validate: (token) => token === 'admin-token-123' || token === 'user-token-456',
      exclude: ['/api/health', '/api/login'],
    }),
  ],
  endpoints: [
    // Health check — no auth required (excluded above)
    { url: '/api/health', body: { status: 'ok', version: '1.0.0' } },

    // Login — no auth required, returns a token based on credentials
    {
      url: '/api/login',
      method: 'POST',
      handler: (req) => {
        const { email, password } = req.body as { email: string; password: string };
        if (email === 'admin@example.com' && password === 'admin') {
          return { body: { token: 'admin-token-123', role: 'admin' } };
        }
        if (email === 'user@example.com' && password === 'pass') {
          return { body: { token: 'user-token-456', role: 'viewer' } };
        }
        return { status: 401, body: { error: 'Invalid credentials' } };
      },
    },

    // User directory — protected by auth middleware
    {
      url: '/internal/users',
      data: [
        { id: 1, name: 'Alice', email: 'alice@example.com', role: 'admin' },
        { id: 2, name: 'Bob', email: 'bob@example.com', role: 'viewer' },
        { id: 3, name: 'Charlie', email: 'charlie@example.com', role: 'editor' },
      ],
    },

    // GET /api/users?role=admin — filterable user list, requires auth
    {
      url: '/api/users',
      method: 'GET',
      handler: (req, ctx) => {
        const users = ctx.endpoints('/internal/users');
        const role = req.query.role as string | undefined;
        const items = role ? users.where((u) => u.role === role) : users.data;
        return { body: { users: items } };
      },
    },

    // GET /api/me — returns the current user based on the token
    {
      url: '/api/me',
      method: 'GET',
      handler: (req) => {
        const authHeader = (req.headers.authorization as string) ?? '';
        const token = authHeader.replace('Bearer ', '');
        if (token === 'admin-token-123') {
          return { body: { name: 'Admin', role: 'admin' } };
        }
        return { body: { name: 'Regular User', role: 'viewer' } };
      },
    },
  ],

  // Scenarios let you switch between different server states.
  scenarios: {
    // "empty" — clear all users, simulate a fresh database
    empty: (s) => {
      s.endpoint('/internal/users').clear();
    },

    // "crowded" — add a bunch more users
    crowded: (s) => {
      const users = s.endpoint('/internal/users');
      users.insert({ name: 'Dana', email: 'dana@example.com', role: 'editor' });
      users.insert({ name: 'Eve', email: 'eve@example.com', role: 'admin' });
      users.insert({ name: 'Frank', email: 'frank@example.com', role: 'viewer' });
    },

    // "down" — simulate a broken backend
    down: (s) => {
      s.endpoint('/internal/users').handler = () => ({
        status: 503,
        body: { error: 'Service temporarily unavailable' },
      });
    },
  },
});

// Runtime middleware — add admin-only guard after server starts
server.use({
  name: 'admin-only-delete',
  pre: (req) => {
    if (req.method === 'DELETE') {
      const authHeader = (req.headers.authorization as string) ?? '';
      const token = authHeader.replace('Bearer ', '');
      if (token !== 'admin-token-123') {
        return { status: 403, body: { error: 'Only admins can delete' } };
      }
    }
  },
});

console.log(`Auth API running at ${server.url}`);
