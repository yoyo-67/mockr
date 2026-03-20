import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRecorder } from '../src/recorder.js';
import { join } from 'node:path';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

describe('Recorder', () => {
  let sessionsDir: string;

  beforeEach(async () => {
    sessionsDir = await mkdtemp(join(tmpdir(), 'mockr-test-'));
  });

  afterEach(async () => {
    await rm(sessionsDir, { recursive: true, force: true });
  });

  it('creates a session and returns metadata', async () => {
    const recorder = createRecorder({ sessionsDir });
    const session = await recorder.startSession('test-session', 'http://example.com');

    expect(session.id).toBeTruthy();
    expect(session.name).toBe('test-session');
    expect(session.baseUrl).toBe('http://example.com');
    expect(session.entries).toEqual([]);
    expect(session.startedAt).toBeGreaterThan(0);
  });

  it('records entries and writes body to disk', async () => {
    const recorder = createRecorder({ sessionsDir });
    const session = await recorder.startSession('test', 'http://example.com');

    const entry = await recorder.record({
      sessionId: session.id,
      url: 'http://example.com/api/users',
      method: 'GET',
      status: 200,
      contentType: 'application/json',
      responseHeaders: { 'content-type': 'application/json' },
      body: JSON.stringify([{ id: 1, name: 'Alice' }]),
      timing: 42,
    });

    expect(entry.id).toBeTruthy();
    expect(entry.url).toBe('http://example.com/api/users');
    expect(entry.method).toBe('GET');
    expect(entry.status).toBe(200);
    expect(entry.size).toBeGreaterThan(0);
    expect(entry.timing).toBe(42);

    // Verify body file was written to disk
    const bodyPath = join(sessionsDir, session.id, 'entries', `${entry.id}.body`);
    const bodyContent = await readFile(bodyPath, 'utf-8');
    expect(JSON.parse(bodyContent)).toEqual([{ id: 1, name: 'Alice' }]);
  });

  it('stops session and writes index.json', async () => {
    const recorder = createRecorder({ sessionsDir });
    const session = await recorder.startSession('test', 'http://example.com');

    await recorder.record({
      sessionId: session.id,
      url: 'http://example.com/api/users',
      method: 'GET',
      status: 200,
      contentType: 'application/json',
      responseHeaders: {},
      body: '[]',
    });

    await recorder.record({
      sessionId: session.id,
      url: 'http://example.com/api/posts',
      method: 'GET',
      status: 200,
      contentType: 'application/json',
      responseHeaders: {},
      body: '[]',
    });

    const stopped = await recorder.stopSession(session.id);
    expect(stopped.stoppedAt).toBeGreaterThan(0);
    expect(stopped.entries).toHaveLength(2);

    // Verify index.json on disk
    const indexPath = join(sessionsDir, session.id, 'index.json');
    const index = JSON.parse(await readFile(indexPath, 'utf-8'));
    expect(index.name).toBe('test');
    expect(index.entries).toHaveLength(2);
  });

  it('lists sessions from disk', async () => {
    const recorder = createRecorder({ sessionsDir });

    const s1 = await recorder.startSession('first', 'http://a.com');
    await recorder.stopSession(s1.id);

    const s2 = await recorder.startSession('second', 'http://b.com');
    await recorder.stopSession(s2.id);

    const sessions = await recorder.listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions.map(s => s.name).sort()).toEqual(['first', 'second']);
  });

  it('loads a session from disk', async () => {
    const recorder = createRecorder({ sessionsDir });
    const session = await recorder.startSession('load-test', 'http://example.com');
    await recorder.record({
      sessionId: session.id,
      url: 'http://example.com/api/data',
      method: 'POST',
      status: 201,
      contentType: 'application/json',
      responseHeaders: {},
      body: '{"created":true}',
    });
    await recorder.stopSession(session.id);

    // Create a new recorder instance (simulates restart)
    const recorder2 = createRecorder({ sessionsDir });
    const loaded = await recorder2.loadSession(session.id);
    expect(loaded.name).toBe('load-test');
    expect(loaded.entries).toHaveLength(1);
    expect(loaded.entries[0].method).toBe('POST');
  });

  it('deletes a session', async () => {
    const recorder = createRecorder({ sessionsDir });
    const session = await recorder.startSession('to-delete', 'http://example.com');
    await recorder.stopSession(session.id);

    await recorder.deleteSession(session.id);

    const sessions = await recorder.listSessions();
    expect(sessions).toHaveLength(0);
  });

  it('exposes sessionsDir', () => {
    const recorder = createRecorder({ sessionsDir });
    expect(recorder.sessionsDir).toBe(sessionsDir);
  });

  it('throws when recording to non-existent session', async () => {
    const recorder = createRecorder({ sessionsDir });
    await expect(recorder.record({
      sessionId: 'nonexistent',
      url: 'http://example.com/test',
      method: 'GET',
      status: 200,
      contentType: 'text/plain',
      responseHeaders: {},
      body: 'hello',
    })).rejects.toThrow('Session not found');
  });

  it('returns empty list when no sessions exist', async () => {
    const recorder = createRecorder({ sessionsDir });
    const sessions = await recorder.listSessions();
    expect(sessions).toEqual([]);
  });
});
