import { useEffect, useRef } from 'react';
import type { MemoryEntry } from './useStore.js';

function isXhr(mimeType: string, url: string): boolean {
  const ct = mimeType.toLowerCase();
  const u = url.toLowerCase();
  if (ct.includes('image') || u.endsWith('.svg')) return false;
  return ct.includes('json') || ct.includes('xml') || ct.includes('text/plain') || u.includes('/api/');
}

export function useRecorder(
  isRecording: boolean,
  entries: MemoryEntry[],
  addEntry: (e: Omit<MemoryEntry, 'id'>) => void,
  clearEntries: () => void,
  preserveLogs: boolean,
) {
  const listenerRef = useRef<((req: chrome.devtools.network.Request) => void) | null>(null);

  useEffect(() => {
    if (!isRecording) {
      if (listenerRef.current) {
        chrome.devtools.network.onRequestFinished.removeListener(listenerRef.current as any);
        listenerRef.current = null;
      }
      return;
    }

    if (listenerRef.current) return;

    const listener = (request: chrome.devtools.network.Request) => {
      const url = request.request.url;
      const method = request.request.method;
      const status = request.response.status;
      const contentType = request.response.content.mimeType || 'application/octet-stream';
      const timing = request.time || 0;
      if (!isXhr(contentType, url)) return;

      const responseHeaders: Record<string, string> = {};
      for (const h of request.response.headers) responseHeaders[h.name.toLowerCase()] = h.value;

      request.getContent((content: string) => {
        addEntry({
          url, method, status, contentType, responseHeaders,
          body: content || '',
          size: (content || '').length,
          timing,
          timestamp: Date.now(),
        });
      });
    };

    listenerRef.current = listener;
    chrome.devtools.network.onRequestFinished.addListener(listener as any);

    return () => {
      if (listenerRef.current) {
        chrome.devtools.network.onRequestFinished.removeListener(listenerRef.current as any);
        listenerRef.current = null;
      }
    };
  }, [isRecording, addEntry]);

  // Clear on navigation unless preserve logs
  useEffect(() => {
    const onNav = () => { if (!preserveLogs) clearEntries(); };
    chrome.devtools.network.onNavigated.addListener(onNav);
    return () => chrome.devtools.network.onNavigated.removeListener(onNav);
  }, [preserveLogs, clearEntries]);
}
