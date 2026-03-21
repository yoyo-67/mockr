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

export async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
    req.on('error', reject);
  });
}

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    ...headers,
  });
  res.end(json);
}

export function sendRaw(res: ServerResponse, status: number, body: string | Buffer, headers: Record<string, string>) {
  res.writeHead(status, {
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
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
