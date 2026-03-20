import type { RecordedEntry, SessionInfo, MapResult } from './types.js';

export class MockrApi {
  constructor(private serverUrl: string) {}

  setServerUrl(url: string) {
    this.serverUrl = url;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.serverUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async startRecording(name: string, baseUrl: string): Promise<{ sessionId: string }> {
    return this.request('/__mockr/record/start', {
      method: 'POST',
      body: JSON.stringify({ name, baseUrl }),
    });
  }

  async recordEntry(sessionId: string, entry: {
    url: string;
    method: string;
    status: number;
    contentType: string;
    responseHeaders: Record<string, string>;
    body: string;
    timing?: number;
  }): Promise<RecordedEntry> {
    return this.request('/__mockr/record', {
      method: 'POST',
      body: JSON.stringify({ sessionId, ...entry }),
    });
  }

  async stopRecording(sessionId: string): Promise<{ id: string; name: string; entryCount: number }> {
    return this.request('/__mockr/record/stop', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  }

  async listSessions(): Promise<SessionInfo[]> {
    return this.request('/__mockr/sessions');
  }

  async getSession(sessionId: string): Promise<{ id: string; name: string; entries: RecordedEntry[] }> {
    return this.request(`/__mockr/sessions/${sessionId}`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request(`/__mockr/sessions/${sessionId}`, { method: 'DELETE' });
  }

  async mapToMockr(sessionId: string, entryIds: string[], options?: { generateTypes?: boolean }): Promise<MapResult> {
    return this.request('/__mockr/map', {
      method: 'POST',
      body: JSON.stringify({ sessionId, entryIds, generateTypes: options?.generateTypes }),
    });
  }

  async getMappedEndpoints(): Promise<Array<{ url: string; method: string; enabled: boolean }>> {
    return this.request('/__mockr/map/endpoints');
  }
}
