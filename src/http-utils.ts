import type { IncomingMessage, ServerResponse } from 'node:http';

export function parseQuery(url: string): Record<string, string | string[]> {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  const search = new URLSearchParams(url.slice(idx + 1));
  const result: Record<string, string | string[]> = {};
  for (const [key, val] of search) {
    const existing = result[key];
    if (existing === undefined) {
      result[key] = val;
    } else if (Array.isArray(existing)) {
      existing.push(val);
    } else {
      result[key] = [existing, val];
    }
  }
  return result;
}

export function getPath(url: string): string {
  const idx = url.indexOf('?');
  return idx === -1 ? url : url.slice(0, idx);
}

export async function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function parseBody(raw: Buffer, contentType: string | undefined): unknown {
  if (raw.length === 0) return undefined;
  const ct = (contentType || '').toLowerCase();
  const text = raw.toString('utf-8');
  if (ct.includes('application/json') || ct.includes('+json')) {
    try { return JSON.parse(text); } catch { return text; }
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(text);
    const obj: Record<string, string | string[]> = {};
    for (const [k, v] of params) {
      const existing = obj[k];
      if (existing === undefined) obj[k] = v;
      else if (Array.isArray(existing)) existing.push(v);
      else obj[k] = [existing, v];
    }
    return obj;
  }
  // Default: try JSON parse for back-compat (mockr previously sniffed all bodies),
  // fall back to raw string. Binary content-types should be inspected via raw Buffer.
  try { return JSON.parse(text); } catch { return text; }
}

function applyHeaders(res: ServerResponse, headers: Record<string, string | string[]>) {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
}

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}) {
  const json = JSON.stringify(body);
  applyHeaders(res, headers);
  if (!res.hasHeader('Content-Type')) res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Length', Buffer.byteLength(json));
  res.writeHead(status);
  res.end(json);
}

export function sendRaw(res: ServerResponse, status: number, body: string | Buffer, headers: Record<string, string | string[]>) {
  applyHeaders(res, headers);
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.writeHead(status);
  res.end(body);
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export function sendCorsJson(res: ServerResponse, status: number, body: unknown) {
  sendJson(res, status, body, CORS_HEADERS);
}

export function handleCorsOptions(res: ServerResponse): void {
  res.writeHead(204, {
    ...CORS_HEADERS,
    'Access-Control-Max-Age': '86400',
  });
  res.end();
}
