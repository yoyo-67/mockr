// Kitchen-sink showcase: dataFile + cross-endpoint + URL params + middleware
// (logger/delay/errorInjection/custom) + scenarios — all in one server.
//
// Each individual feature is demoed in isolation in the earlier examples
// (02-data-files, 03-cross-endpoint, 04-handlers-zod, 05-middleware,
// 06-scenarios). This one shows them composed.

import { mockr, delay, logger, errorInjection, handler } from '../../src/index.js';

interface Room {
  id: number;
  name: string;
  created_by: string;
  is_private: boolean;
}

interface Message {
  id: number;
  room_id: number;
  author: string;
  text: string;
  timestamp: string;
}

type Endpoints = {
  '/internal/rooms': Room[];
  '/internal/messages': Message[];
};

mockr<Endpoints>({
  port: 3010,
  middleware: [
    logger(),
    delay({ min: 20, max: 80 }),
    // 5% of requests randomly fail with 500 — useful for testing retry logic
    errorInjection({ rate: 0.05, status: 500 }),
    // Custom middleware: inject a request ID header into every response
    {
      name: 'request-id',
      post: (_req, res) => {
        const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        return {
          ...res,
          headers: { ...res.headers, 'x-request-id': id },
        };
      },
    },
  ],
  endpoints: [
    // Data loaded from JSON files
    {
      url: '/internal/rooms',
      dataFile: new URL('./rooms.json', import.meta.url).pathname,
    },
    {
      url: '/internal/messages',
      dataFile: new URL('./messages.json', import.meta.url).pathname,
    },

    // GET /api/rooms — list rooms, optionally filter by ?private=true/false
    {
      url: '/api/rooms',
      method: 'GET',
      handler: handler({ fn: (req, ctx) => {
        const rooms = ctx.endpoint('/internal/rooms');
        const priv = req.query.private as string | undefined;
        if (priv !== undefined) {
          const isPrivate = priv === 'true';
          return { body: rooms.where((r) => r.is_private === isPrivate) };
        }
        return { body: rooms.data };
      } }),
    },

    // GET /api/rooms/:roomId/messages — messages for a specific room
    {
      url: '/api/rooms/:roomId/messages',
      method: 'GET',
      handler: handler({ fn: (req, ctx) => {
        const roomId = Number(req.params.roomId);
        const rooms = ctx.endpoint('/internal/rooms');
        const messages = ctx.endpoint('/internal/messages');

        if (!rooms.has(roomId)) {
          return { status: 404, body: { error: `Room ${roomId} not found` } };
        }

        const roomMessages = messages
          .where((m) => m.room_id === roomId)
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

        return { body: { room_id: roomId, messages: roomMessages } };
      } }),
    },

    // POST /api/rooms/:roomId/messages — send a message
    {
      url: '/api/rooms/:roomId/messages',
      method: 'POST',
      handler: handler({ fn: (req, ctx) => {
        const roomId = Number(req.params.roomId);
        const { author, text } = req.body as { author: string; text: string };
        const rooms = ctx.endpoint('/internal/rooms');
        const messages = ctx.endpoint('/internal/messages');

        if (!rooms.has(roomId)) {
          return { status: 404, body: { error: `Room ${roomId} not found` } };
        }

        const msg = messages.insert({
          room_id: roomId,
          author,
          text,
          timestamp: new Date().toISOString(),
        } as Message);

        return { status: 201, body: msg };
      } }),
    },

    // GET /api/search?q=keyword — search messages across all rooms
    {
      url: '/api/search',
      method: 'GET',
      handler: handler({ fn: (req, ctx) => {
        const q = (req.query.q as string ?? '').toLowerCase();
        if (!q) {
          return { status: 400, body: { error: 'Missing ?q= parameter' } };
        }
        const messages = ctx.endpoint('/internal/messages');
        const rooms = ctx.endpoint('/internal/rooms');

        const results = messages
          .where((m) => m.text.toLowerCase().includes(q))
          .map((m) => ({
            ...m,
            room_name: rooms.findById(m.room_id)?.name ?? 'unknown',
          }));

        return { body: { query: q, results, count: results.length } };
      } }),
    },

    // GET /api/stats — aggregate stats across endpoints
    {
      url: '/api/stats',
      method: 'GET',
      handler: handler({ fn: (_req, ctx) => {
        const rooms = ctx.endpoint('/internal/rooms');
        const messages = ctx.endpoint('/internal/messages');

        const perRoom = rooms.data.map((r) => ({
          room: r.name,
          message_count: messages.where((m) => m.room_id === r.id).length,
        }));

        return {
          body: {
            total_rooms: rooms.count(),
            total_messages: messages.count(),
            per_room: perRoom,
          },
        };
      } }),
    },
  ],

  scenarios: {
    // "busy" — lots of messages in general
    busy: (s) => {
      const messages = s.endpoint('/internal/messages');
      for (let i = 0; i < 20; i++) {
        messages.insert({
          room_id: 1,
          author: ['alice', 'bob', 'charlie'][i % 3],
          text: `Message #${i + 1} in a busy channel`,
          timestamp: new Date(Date.now() - (20 - i) * 60000).toISOString(),
        } as Message);
      }
    },

    // "empty" — fresh start, no messages
    empty: (s) => {
      s.endpoint('/internal/messages').clear();
    },
  },
});

console.log(`Chat API running at http://localhost:3010`);
