import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { WsSpec, WsHandle, WsClient } from './ws.js';
import { parseQuery, getPath } from './http-utils.js';
import type { MatchFn } from './router.js';

interface InternalClient {
  id: string;
  socket: WebSocket;
  state: any;
  query: Record<string, string | string[]>;
  params: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  subprotocol?: string;
  connectedAt: Date;
  abortController: AbortController;
}

export interface WsRuntime {
  spec: WsSpec<any, any, any>;
  wss: WebSocketServer;
  clients: Map<string, InternalClient>;
  handle: WsHandle<any>;
  /**
   * Handle an incoming HTTP upgrade. Validates schemas (query/params) and
   * negotiates the WebSocket handshake. Caller has already URL-matched.
   */
  handleUpgrade(req: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer, params: Record<string, string>): void;
}

let nextClientId = 1;

function applySchema<T>(schema: { safeParse(d: unknown): { success: true; data: T } | { success: false; error: any } } | undefined, value: unknown): { ok: true; data: T } | { ok: false; issues: unknown } {
  if (!schema) return { ok: true, data: value as T };
  const r = schema.safeParse(value);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, issues: r.error?.issues ?? r.error?.message };
}

/**
 * Build a `WsRuntime` for one ws endpoint. Owns the per-endpoint
 * `WebSocketServer` (in `noServer: true` mode) and the connected-client map.
 * The returned `handle` is what `ctx.endpoint(url)` resolves to for cross-
 * endpoint broadcast / send / close.
 */
export function createWsRuntime(spec: WsSpec<any, any, any>): WsRuntime {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map<string, InternalClient>();

  function makeClientView(c: InternalClient): WsClient {
    return {
      id: c.id,
      query: c.query,
      params: c.params,
      headers: c.headers,
      state: c.state,
      subprotocol: c.subprotocol,
      connectedAt: c.connectedAt,
    };
  }

  function safeSend(c: InternalClient, message: unknown): void {
    if (c.abortController.signal.aborted) return;
    if (c.socket.readyState !== c.socket.OPEN) return;
    const payload = typeof message === 'string' || Buffer.isBuffer(message) ? message : JSON.stringify(message);
    c.socket.send(payload);
  }

  const handle: WsHandle<any> = {
    broadcast(message, filter) {
      for (const c of clients.values()) {
        if (filter && !filter(makeClientView(c))) continue;
        safeSend(c, message);
      }
    },
    send(clientId, message) {
      const c = clients.get(clientId);
      if (!c) return;
      safeSend(c, message);
    },
    close(clientId, code = 1000, reason = '') {
      if (clientId === undefined) {
        for (const c of clients.values()) c.socket.close(code, reason);
        return;
      }
      const c = clients.get(clientId);
      if (c) c.socket.close(code, reason);
    },
    clients() {
      return Array.from(clients.values()).map(makeClientView);
    },
    count() {
      return clients.size;
    },
  };

  function handleUpgrade(req: IncomingMessage, sock: import('node:stream').Duplex, head: Buffer, params: Record<string, string>): void {
    const url = req.url || '/';
    const query = parseQuery(url);

    // Validate query/params schemas before completing the handshake. Reject
    // on failure so a misconfigured client gets a 4xx instead of an open
    // socket that immediately produces error frames.
    const qResult = applySchema(spec.query, query);
    if (!qResult.ok) {
      sock.write('HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\n\r\n' + JSON.stringify({ error: 'query validation', issues: qResult.issues }));
      sock.destroy();
      return;
    }
    const pResult = applySchema(spec.params, params);
    if (!pResult.ok) {
      sock.write('HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\n\r\n' + JSON.stringify({ error: 'params validation', issues: pResult.issues }));
      sock.destroy();
      return;
    }

    wss.handleUpgrade(req, sock, head, (socket) => {
      const id = `wsc_${nextClientId++}`;
      const ac = new AbortController();
      const internal: InternalClient = {
        id,
        socket,
        state: spec.initialState ? spec.initialState() : {},
        query,
        params,
        headers: { ...req.headers },
        subprotocol: socket.protocol || undefined,
        connectedAt: new Date(),
        abortController: ac,
      };
      clients.set(id, internal);

      const send = (out: unknown) => safeSend(internal, out);

      // onConnect
      if (spec.onConnect) {
        Promise.resolve(spec.onConnect({
          send,
          state: internal.state,
          query: internal.query,
          params: internal.params,
          headers: internal.headers,
          id,
          subprotocol: internal.subprotocol,
        })).catch((err) => console.error(`mockr ws: onConnect threw for ${id}:`, err));
      }

      socket.on('message', (raw, isBinary) => {
        if (!spec.onMessage) return;
        let parsed: unknown;
        if (isBinary) {
          parsed = raw;
        } else {
          const text = raw.toString();
          try { parsed = JSON.parse(text); } catch { parsed = text; }
        }
        const mResult = applySchema(spec.message, parsed);
        if (!mResult.ok) {
          safeSend(internal, { type: '__mockr_error', code: 'validation', issues: mResult.issues });
          return;
        }
        Promise.resolve(spec.onMessage({
          send,
          data: mResult.data,
          state: internal.state,
          signal: ac.signal,
          id,
          query: internal.query,
          params: internal.params,
          headers: internal.headers,
        })).catch((err) => console.error(`mockr ws: onMessage threw for ${id}:`, err));
      });

      socket.on('close', (code, reasonBuf) => {
        ac.abort();
        clients.delete(id);
        if (spec.onClose) {
          Promise.resolve(spec.onClose({
            state: internal.state,
            code,
            reason: reasonBuf.toString(),
            id,
          })).catch((err) => console.error(`mockr ws: onClose threw for ${id}:`, err));
        }
      });

      socket.on('error', (err) => {
        console.error(`mockr ws: socket error for ${id}:`, err.message);
      });
    });
  }

  return { spec, wss, clients, handle, handleUpgrade };
}

/**
 * Close every client across every ws runtime — used on scenario switch and
 * server shutdown so old handlers don't service new frames.
 */
export function closeAllClients(runtimes: Iterable<WsRuntime>, code = 1012, reason = 'restart'): void {
  for (const r of runtimes) {
    for (const c of r.clients.values()) {
      c.abortController.abort();
      c.socket.close(code, reason);
    }
  }
}

/** Best-effort URL-match helper. Mirrors the HTTP router's matcher contract. */
export function matchWsEndpoint(
  runtimes: Map<MatchFn, WsRuntime>,
  url: string,
): { runtime: WsRuntime; params: Record<string, string> } | null {
  const path = getPath(url);
  for (const [matcher, runtime] of runtimes) {
    const m = matcher(path);
    if (m) return { runtime, params: m.params };
  }
  return null;
}
