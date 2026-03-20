import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface RecordedEntryMeta {
  id: string;
  url: string;
  method: string;
  status: number;
  contentType: string;
  responseHeaders: Record<string, string>;
  size: number;
  timing?: number;
  timestamp: number;
}

export interface SessionMeta {
  id: string;
  name: string;
  baseUrl: string;
  entries: RecordedEntryMeta[];
  startedAt: number;
  stoppedAt?: number;
}

export interface RecordInput {
  sessionId: string;
  url: string;
  method: string;
  status: number;
  contentType: string;
  responseHeaders: Record<string, string>;
  body: string;
  timing?: number;
}

export interface RecorderOptions {
  sessionsDir: string;
}

export interface Recorder {
  sessionsDir: string;
  startSession(name: string, baseUrl: string): Promise<SessionMeta>;
  record(input: RecordInput): Promise<RecordedEntryMeta>;
  stopSession(sessionId: string): Promise<SessionMeta>;
  listSessions(): Promise<SessionMeta[]>;
  loadSession(sessionId: string): Promise<SessionMeta>;
  deleteSession(sessionId: string): Promise<void>;
}

export function createRecorder(options: RecorderOptions): Recorder {
  const { sessionsDir } = options;
  const activeSessions = new Map<string, SessionMeta>();

  function sessionDir(sessionId: string): string {
    return join(sessionsDir, sessionId);
  }

  function entriesDir(sessionId: string): string {
    return join(sessionDir(sessionId), 'entries');
  }

  function indexPath(sessionId: string): string {
    return join(sessionDir(sessionId), 'index.json');
  }

  async function startSession(name: string, baseUrl: string): Promise<SessionMeta> {
    const id = randomUUID();
    const session: SessionMeta = {
      id,
      name,
      baseUrl,
      entries: [],
      startedAt: Date.now(),
    };

    await mkdir(entriesDir(id), { recursive: true });
    activeSessions.set(id, session);
    return session;
  }

  async function record(input: RecordInput): Promise<RecordedEntryMeta> {
    const session = activeSessions.get(input.sessionId);
    if (!session) throw new Error(`Session not found: ${input.sessionId}`);

    const entryId = randomUUID();
    const bodyPath = join(entriesDir(input.sessionId), `${entryId}.body`);

    // Write body to disk immediately
    await writeFile(bodyPath, input.body, 'utf-8');

    const meta: RecordedEntryMeta = {
      id: entryId,
      url: input.url,
      method: input.method.toUpperCase(),
      status: input.status,
      contentType: input.contentType,
      responseHeaders: input.responseHeaders,
      size: Buffer.byteLength(input.body),
      timing: input.timing,
      timestamp: Date.now(),
    };

    session.entries.push(meta);
    return meta;
  }

  async function stopSession(sessionId: string): Promise<SessionMeta> {
    const session = activeSessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    session.stoppedAt = Date.now();
    await writeFile(indexPath(sessionId), JSON.stringify(session, null, 2), 'utf-8');
    activeSessions.delete(sessionId);
    return session;
  }

  async function listSessions(): Promise<SessionMeta[]> {
    try {
      const dirs = await readdir(sessionsDir, { withFileTypes: true });
      const sessions: SessionMeta[] = [];
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        try {
          const raw = await readFile(join(sessionsDir, d.name, 'index.json'), 'utf-8');
          sessions.push(JSON.parse(raw));
        } catch {
          // Skip incomplete sessions
        }
      }
      return sessions.sort((a, b) => b.startedAt - a.startedAt);
    } catch {
      return [];
    }
  }

  async function loadSession(sessionId: string): Promise<SessionMeta> {
    // Check active sessions first
    const active = activeSessions.get(sessionId);
    if (active) return active;

    const raw = await readFile(indexPath(sessionId), 'utf-8');
    return JSON.parse(raw);
  }

  async function deleteSession(sessionId: string): Promise<void> {
    activeSessions.delete(sessionId);
    await rm(sessionDir(sessionId), { recursive: true, force: true });
  }

  return {
    sessionsDir,
    startSession,
    record,
    stopSession,
    listSessions,
    loadSession,
    deleteSession,
  };
}
