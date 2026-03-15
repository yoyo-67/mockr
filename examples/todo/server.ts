// Simplest possible example — define data, get full REST API for free.

import { mockr } from '../../src/index.js';

interface Todo {
  id: number;
  title: string;
  done: boolean;
}

type Endpoints = {
  '/api/todos': Todo;
};

const server = await mockr<Endpoints>({
  port: 3001,
  endpoints: [
    {
      url: '/api/todos',
      data: [
        { id: 1, title: 'Buy milk', done: false },
        { id: 2, title: 'Write tests', done: true },
        { id: 3, title: 'Deploy to prod', done: false },
      ],
    },
  ],
});

console.log(`Todo API running at ${server.url}`);
