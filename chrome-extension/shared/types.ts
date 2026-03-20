export interface RecordedEntry {
  id: string;
  url: string;
  method: string;
  status: number;
  contentType: string;
  size: number;
  timing?: number;
  timestamp: number;
}

export interface SessionInfo {
  id: string;
  name: string;
  baseUrl: string;
  startedAt: number;
  stoppedAt?: number;
  entryCount: number;
}

export interface MapResult {
  mapped: Array<{
    url: string;
    method: string;
    bodyFile: string;
    typesFile?: string;
  }>;
}
