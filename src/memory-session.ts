import { randomUUID } from 'node:crypto';

export type FilterCategory = 'json' | 'xml' | 'text' | 'html' | 'js' | 'css' | 'image' | 'font' | 'other';

export function categorize(mimeType: string, urlPath: string): FilterCategory {
  const ct = (mimeType || '').toLowerCase();
  const u = (urlPath || '').toLowerCase().split(/[?#]/)[0];

  if (ct.includes('json')) return 'json';
  if (ct.includes('xml')) return 'xml';
  if (ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/.test(u)) return 'image';
  if (ct.startsWith('font/') || ct.includes('font-woff') || /\.(woff2?|ttf|otf|eot)$/.test(u)) return 'font';
  if (ct.includes('javascript') || ct.includes('ecmascript') || /\.m?jsx?$/.test(u)) return 'js';
  if (ct.includes('css') || /\.css$/.test(u)) return 'css';
  if (ct.includes('html')) return 'html';
  if (ct.startsWith('text/')) return 'text';
  return 'other';
}

export interface CachedResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: unknown;
  /** Pre-serialized body (set on record). Avoids re-stringify on every replay hit. */
  bodyText?: string;
  contentType: string;
  recordedAt?: number;
}

export interface MemorySession {
  id: string;
  name: string;
  createdAt: number;
  entries: Map<string, CachedResponse>;
}

export interface SessionInfo {
  id: string;
  name: string;
  createdAt: number;
  entryCount: number;
}

export interface CacheLookupInput {
  method: string;
  path: string;
  query: Record<string, string | string[] | undefined>;
}

export type SessionMode = 'record' | 'replay' | 'off';

export interface MemorySessionStore {
  create(name: string): MemorySession;
  get(id: string): MemorySession | undefined;
  list(): MemorySession[];
  delete(id: string): boolean;
  setActive(id: string | null, mode: SessionMode): void;
  getActive(): { session: MemorySession; mode: 'record' | 'replay' } | null;
  recordResponse(req: CacheLookupInput, response: CachedResponse): void;
  lookupResponse(req: CacheLookupInput): CachedResponse | undefined;
  clear(id: string): void;
  deleteEntry(id: string, key: string): boolean;
  setCaptureFilter(filter: Record<FilterCategory, boolean> | null): void;
  getCaptureFilter(): Record<FilterCategory, boolean> | null;
  info(session: MemorySession): SessionInfo;
}

const CACHEABLE_METHODS = new Set(['GET', 'HEAD']);

function normalizeQuery(query: Record<string, string | string[] | undefined>): string {
  const keys = Object.keys(query).sort();
  if (keys.length === 0) return '';
  const parts: string[] = [];
  for (const key of keys) {
    const val = query[key];
    if (val === undefined) continue;
    if (Array.isArray(val)) {
      for (const v of val) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
    }
  }
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

function cacheKey(input: CacheLookupInput): string {
  return `${input.method.toUpperCase()} ${input.path}${normalizeQuery(input.query)}`;
}

export function createMemorySessionStore(): MemorySessionStore {
  const sessions: MemorySession[] = [];
  const byId = new Map<string, MemorySession>();
  let active: { session: MemorySession; mode: 'record' | 'replay' } | null = null;
  let captureFilter: Record<FilterCategory, boolean> | null = null;

  function create(name: string): MemorySession {
    const session: MemorySession = {
      id: randomUUID(),
      name,
      createdAt: Date.now(),
      entries: new Map(),
    };
    sessions.push(session);
    byId.set(session.id, session);
    return session;
  }

  function get(id: string): MemorySession | undefined {
    return byId.get(id);
  }

  function list(): MemorySession[] {
    return [...sessions];
  }

  function remove(id: string): boolean {
    const s = byId.get(id);
    if (!s) return false;
    byId.delete(id);
    const idx = sessions.indexOf(s);
    if (idx !== -1) sessions.splice(idx, 1);
    if (active?.session.id === id) active = null;
    return true;
  }

  function setActive(id: string | null, mode: SessionMode): void {
    if (id === null || mode === 'off') {
      active = null;
      return;
    }
    const session = byId.get(id);
    if (!session) throw new Error(`Memory session not found: ${id}`);
    active = { session, mode };
  }

  function getActive() {
    return active;
  }

  function recordResponse(req: CacheLookupInput, response: CachedResponse): void {
    if (!active || active.mode !== 'record') return;
    if (!CACHEABLE_METHODS.has(req.method.toUpperCase())) return;
    if (captureFilter) {
      const cat = categorize(response.contentType, req.path);
      if (!captureFilter[cat]) return;
    }
    const key = cacheKey(req);
    active.session.entries.set(key, { ...response, recordedAt: Date.now() });
  }

  function lookupResponse(req: CacheLookupInput): CachedResponse | undefined {
    if (!active || active.mode !== 'replay') return undefined;
    if (!CACHEABLE_METHODS.has(req.method.toUpperCase())) return undefined;
    return active.session.entries.get(cacheKey(req));
  }

  function clear(id: string): void {
    const s = byId.get(id);
    if (s) s.entries.clear();
  }

  function deleteEntry(id: string, key: string): boolean {
    const s = byId.get(id);
    if (!s) return false;
    return s.entries.delete(key);
  }

  function setCaptureFilter(filter: Record<FilterCategory, boolean> | null): void {
    captureFilter = filter;
  }

  function getCaptureFilter(): Record<FilterCategory, boolean> | null {
    return captureFilter;
  }

  function info(session: MemorySession): SessionInfo {
    return { id: session.id, name: session.name, createdAt: session.createdAt, entryCount: session.entries.size };
  }

  return {
    create,
    get,
    list,
    delete: remove,
    setActive,
    getActive,
    recordResponse,
    lookupResponse,
    clear,
    deleteEntry,
    setCaptureFilter,
    getCaptureFilter,
    info,
  };
}
