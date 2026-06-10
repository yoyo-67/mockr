import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

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
  // Undefined body (e.g. a 204 from ctx.noContent) serializes to no content.
  const json = body === undefined ? '' : JSON.stringify(body);
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

/** Minimal extension → Content-Type map. Unknown → application/octet-stream. */
const MIME_BY_EXT: Record<string, string> = {
  json: 'application/json',
  html: 'text/html',
  htm: 'text/html',
  txt: 'text/plain',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  wasm: 'application/wasm',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

function contentTypeFromPath(path: string): string {
  const dot = path.lastIndexOf('.');
  const ext = dot === -1 ? '' : path.slice(dot + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/**
 * Parse a single-range `Range` header against a known file `size`.
 * Returns `null` for an absent/malformed/multi-range header (caller serves the
 * full body), `{ unsatisfiable: true }` when the range can't be satisfied
 * (caller emits 416), or `{ start, end }` (inclusive) for a 206. Supports the
 * three single-range syntaxes: `bytes=s-e`, `bytes=s-`, `bytes=-n`.
 */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | { unsatisfiable: true } | null {
  if (!header) return null;
  const m = /^bytes=(.*)$/.exec(header.trim());
  if (!m) return null;
  const spec = m[1];
  if (spec.includes(',')) return null; // multi-range: serve full body
  const dash = spec.indexOf('-');
  if (dash === -1) return null;
  const startStr = spec.slice(0, dash).trim();
  const endStr = spec.slice(dash + 1).trim();

  if (startStr === '') {
    // Suffix: last N bytes.
    if (endStr === '') return null;
    const n = Number(endStr);
    if (!Number.isInteger(n) || n < 0) return null;
    if (n === 0) return { unsatisfiable: true };
    if (size === 0) return { unsatisfiable: true };
    const start = n >= size ? 0 : size - n;
    return { start, end: size - 1 };
  }

  const start = Number(startStr);
  if (!Number.isInteger(start) || start < 0) return null;
  if (start >= size) return { unsatisfiable: true };

  let end = endStr === '' ? size - 1 : Number(endStr);
  if (!Number.isInteger(end) || end < start) return null;
  if (end > size - 1) end = size - 1; // clamp, still 206
  return { start, end };
}

/**
 * Stream a file as the response body. Stats the file for size, sets
 * `Content-Type` (from extension, default `application/octet-stream`),
 * advertises `Accept-Ranges`, and honors a single-range `Range` request with
 * `206 Partial Content` — all without ever buffering the whole body in memory.
 */
export async function sendFile(
  req: IncomingMessage,
  res: ServerResponse,
  result: { path: string; status?: number; headers?: Record<string, string | string[]> },
  status: number,
) {
  let info;
  try {
    info = await stat(result.path);
  } catch {
    info = null;
  }
  if (!info || !info.isFile()) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `File not found: ${result.path}` }));
    return;
  }

  if (result.headers) applyHeaders(res, result.headers);
  if (!res.hasHeader('Content-Type')) res.setHeader('Content-Type', contentTypeFromPath(result.path));
  res.setHeader('Accept-Ranges', 'bytes');

  // HEAD: headers only — never read the file body (matters for multi-GB files).
  if (req.method === 'HEAD') {
    res.setHeader('Content-Length', info.size);
    res.writeHead(status);
    res.end();
    return;
  }

  const rangeHeader = req.headers.range;
  const range = parseRange(Array.isArray(rangeHeader) ? rangeHeader[0] : rangeHeader, info.size);

  if (range && 'unsatisfiable' in range) {
    res.setHeader('Content-Range', `bytes */${info.size}`);
    res.writeHead(416);
    res.end();
    return;
  }

  if (range) {
    const chunk = range.end - range.start + 1;
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`);
    res.setHeader('Content-Length', chunk);
    res.writeHead(206);
    streamToResponse(createReadStream(result.path, { start: range.start, end: range.end }), res);
    return;
  }

  res.setHeader('Content-Length', info.size);
  res.writeHead(status);
  streamToResponse(createReadStream(result.path), res);
}

/**
 * Pipe a read stream to the response and tear it down on client abort or
 * stream error — so a canceled multi-GB download (e.g. a video seek) never
 * leaks the open file descriptor.
 */
function streamToResponse(stream: ReturnType<typeof createReadStream>, res: ServerResponse) {
  const destroy = () => { if (!stream.destroyed) stream.destroy(); };
  res.on('close', destroy);
  stream.on('error', () => { destroy(); res.destroy(); });
  stream.pipe(res);
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
