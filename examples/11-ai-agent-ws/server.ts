// Feature: WebSocket mocking via `ws({...})`.
//
// Demonstrates an AI-agent style streaming protocol over WS:
//   client → { type: 'message', content: '...' }
//          | { type: 'cancel' }
//   server → { type: 'message_start', id }
//          | { type: 'content_delta', text }
//          | { type: 'tool_use', toolUseId, tool, input }
//          | { type: 'tool_result', toolUseId, result }
//          | { type: 'message_stop', stopReason }
//          | { type: 'error', code, message }
//
// Plus a cross-endpoint HTTP trigger that broadcasts a server-pushed event
// to every connected client (mirrors a real backend pushing live updates).

import { mockr, ws, handler, type WsEndpoint, type Middleware } from '../../src/index.js';

// Permissive CORS for local browser demos — page served from `python3 -m http.server`
// on a different port than mockr. Drop in production / real backend mocks.
const cors: Middleware = {
  name: 'cors',
  pre(req) {
    if (req.method === 'OPTIONS') {
      return {
        status: 204,
        body: '',
        headers: {
          'Access-Control-Allow-Origin': (req.headers.origin as string | undefined) ?? '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      };
    }
  },
  post(req, res) {
    const origin = (req.headers.origin as string | undefined) ?? '*';
    return {
      ...res,
      headers: { ...(res.headers ?? {}), 'Access-Control-Allow-Origin': origin },
    } as typeof res;
  },
};

type ClientEvent =
  | { type: 'message'; content: string }
  | { type: 'cancel' };

type ServerEvent =
  | { type: 'hello'; conversationId: string }
  | { type: 'message_start'; id: string }
  | { type: 'content_delta'; text: string }
  | { type: 'tool_use'; toolUseId: string; tool: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; result: unknown }
  | { type: 'message_stop'; stopReason: 'end_turn' | 'cancelled' | 'tool_use' }
  | { type: 'error'; code: string; message: string }
  | { type: 'broadcast'; text: string };

type Endpoints = {
  '/ws/agent': WsEndpoint<ServerEvent, ClientEvent>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tokenize = (s: string) => s.match(/\S+\s*|\s+/g) ?? [s];

interface ConnState {
  cancelled: boolean;
  conversationId: string;
}

mockr<Endpoints>({
  port: 3011,
  middleware: [cors],
  endpoints: [
    {
      url: '/ws/agent',
      ws: ws<ServerEvent, ClientEvent, ConnState>({
        initialState: () => ({ cancelled: false, conversationId: 'unset' }),
        onConnect: ({ send, state, query }) => {
          const cid = (typeof query.conversationId === 'string' ? query.conversationId : 'demo');
          state.conversationId = cid;
          send({ type: 'hello', conversationId: cid });
        },
        onMessage: async ({ data, send, state, signal }) => {
          if (data.type === 'cancel') {
            state.cancelled = true;
            return;
          }
          state.cancelled = false;
          const id = `msg_${Date.now()}`;
          send({ type: 'message_start', id });

          const reply = pickReply(data.content);

          for (const tok of reply.tokens) {
            if (signal.aborted || state.cancelled) {
              send({ type: 'message_stop', stopReason: 'cancelled' });
              return;
            }
            await sleep(15);
            send({ type: 'content_delta', text: tok });
          }

          if (reply.tool) {
            const toolUseId = `tu_${Date.now()}`;
            send({ type: 'tool_use', toolUseId, tool: reply.tool.name, input: reply.tool.input });
            await sleep(50);
            send({ type: 'tool_result', toolUseId, result: reply.tool.result });
          }

          send({ type: 'message_stop', stopReason: reply.stop });
        },
      }),
    },

    // Cross-endpoint trigger — POST broadcasts to every connected ws client.
    {
      url: '/api/broadcast',
      method: 'POST',
      handler: handler({
        fn: (req, ctx) => {
          const text = (req.body as { text?: string } | undefined)?.text ?? 'ping';
          ctx.endpoint('/ws/agent').broadcast({ type: 'broadcast', text });
          const count = ctx.endpoint('/ws/agent').count();
          return { body: { delivered: count } };
        },
      }),
    },
  ],
});

function pickReply(prompt: string): {
  tokens: string[];
  stop: 'end_turn' | 'tool_use';
  tool?: { name: string; input: unknown; result: unknown };
} {
  if (/weather/i.test(prompt)) {
    return {
      tokens: tokenize('Let me check the weather for you. '),
      tool: { name: 'get_weather', input: { city: 'SF' }, result: { tempF: 64, condition: 'foggy' } },
      stop: 'tool_use',
    };
  }
  return {
    tokens: tokenize(`Echo: "${prompt}". This is a fake reply for offline dev.`),
    stop: 'end_turn',
  };
}

console.log(`AI agent WS example running at http://localhost:3011`);
console.log(`  WS    /ws/agent?conversationId=demo`);
console.log(`  POST  /api/broadcast   { "text": "..." }   (push to all clients)`);
