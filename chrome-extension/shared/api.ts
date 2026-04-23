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

  async mapEntries(entries: Array<{ url: string; method: string; status: number; contentType: string; body: string }>): Promise<MapResult> {
    return this.request('/__mockr/map', {
      method: 'POST',
      body: JSON.stringify({ entries }),
    });
  }

  async getMappedEndpoints(): Promise<Array<{ url: string; method: string; enabled: boolean }>> {
    return this.request('/__mockr/map/endpoints');
  }

  async listEndpoints(): Promise<Array<{ url: string; method: string; type: string; enabled: boolean; itemCount: number | null; bodyFile?: string }>> {
    return this.request('/__mockr/endpoints');
  }

  async updateEndpointUrl(oldUrl: string, newUrl: string, method?: string): Promise<void> {
    await this.request('/__mockr/endpoints', {
      method: 'PATCH',
      body: JSON.stringify({ oldUrl, newUrl, method }),
    });
  }

  async updateEndpointType(url: string, type: string, method?: string): Promise<void> {
    await this.request('/__mockr/endpoints/type', {
      method: 'PATCH',
      body: JSON.stringify({ url, type, method }),
    });
  }

  async deleteEndpoint(url: string, method?: string): Promise<void> {
    await this.request('/__mockr/endpoints', {
      method: 'DELETE',
      body: JSON.stringify({ url, method }),
    });
  }

  async toggleEndpoint(url: string, enabled: boolean, method?: string): Promise<void> {
    await this.request('/__mockr/endpoints/toggle', {
      method: 'POST',
      body: JSON.stringify({ url, enabled, method }),
    });
  }

  // In-memory replay sessions
  async createMemSession(name: string): Promise<MemSessionInfo> {
    return this.request('/__mockr/mem-sessions', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async listMemSessions(): Promise<{ sessions: MemSessionInfo[]; active: MemSessionActive | null }> {
    return this.request('/__mockr/mem-sessions');
  }

  async getMemSession(id: string): Promise<MemSessionInfo & { entries: MemSessionEntry[] }> {
    return this.request(`/__mockr/mem-sessions/${id}`);
  }

  async deleteMemSession(id: string): Promise<void> {
    await this.request(`/__mockr/mem-sessions/${id}`, { method: 'DELETE' });
  }

  async activateMemSession(id: string, mode: 'record' | 'replay'): Promise<void> {
    await this.request(`/__mockr/mem-sessions/${id}/activate`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
  }

  async deactivateMemSession(): Promise<void> {
    await this.request('/__mockr/mem-sessions/deactivate', { method: 'POST' });
  }

  async clearMemSession(id: string): Promise<void> {
    await this.request(`/__mockr/mem-sessions/${id}/clear`, { method: 'POST' });
  }
}

export interface MemSessionInfo {
  id: string;
  name: string;
  createdAt: number;
  entryCount: number;
}

export interface MemSessionActive {
  id: string;
  name: string;
  mode: 'record' | 'replay';
}

export interface MemSessionEntry {
  key: string;
  status: number;
  headers: Record<string, string>;
  body: unknown;
  contentType: string;
  recordedAt?: number;
}
