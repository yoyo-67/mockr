// Feature: data: T[] → list endpoint with free CRUD.
//
// Define an array of items and you get GET, POST, PUT, PATCH, DELETE
// out of the box. Mutations persist in memory across requests.

import { mockr } from '../../src/index.js';

interface Todo {
  id: number;
  title: string;
  done: boolean;
}

type Endpoints = {
  '/api/todos': Todo[];
};

mockr<Endpoints>({
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

console.log(`Data-list example running at http://localhost:3001`);
console.log(`  GET    /api/todos        list`);
console.log(`  POST   /api/todos        insert`);
console.log(`  PATCH  /api/todos/:id    partial update`);
console.log(`  DELETE /api/todos/:id    remove`);
