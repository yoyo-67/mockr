// Feature: named scenarios.
//
// Scenarios are setup functions that switch the server into a named state.
// Useful for demos, e2e tests, and reproducing edge cases. Switch via
// `server.scenario(name)` or `POST /__mockr/scenario { name }`.

import { mockr } from '../../src/index.js';

interface User { id: number; name: string; role: string }

type Endpoints = {
  '/api/users': User[];
};

mockr<Endpoints>({
  port: 3006,
  endpoints: [
    {
      url: '/api/users',
      data: [
        { id: 1, name: 'Alice', role: 'admin' },
        { id: 2, name: 'Bob', role: 'viewer' },
      ],
    },
  ],
  scenarios: {
    // No users — empty list.
    empty: (s) => {
      s.endpoint('/api/users').clear();
    },

    // Many users.
    crowded: (s) => {
      const users = s.endpoint('/api/users');
      for (let i = 0; i < 10; i++) {
        users.insert({ name: `User ${i}`, role: 'viewer' } as User);
      }
    },

    // Backend down — every read returns 503.
    down: (s) => {
      s.endpoint('/api/users').handler = () => ({
        status: 503,
        body: { error: 'Service temporarily unavailable' },
      });
    },
  },
});

console.log(`Scenarios example running at http://localhost:3006`);
console.log(`  GET    /api/users               (default state)`);
console.log(`  POST   /__mockr/scenario        { "name": "empty" | "crowded" | "down" }`);
