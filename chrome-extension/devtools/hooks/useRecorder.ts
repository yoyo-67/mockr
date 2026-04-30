import { useEffect, useRef } from 'react';
import type { MemoryEntry } from './useStore.js';
import { categorize, type FilterCategory } from '../../shared/recording-filter.js';

export function useRecorder(
  isRecording: boolean,
  entries: MemoryEntry[],
  addEntry: (e: Omit<MemoryEntry, 'id'>) => void,
  clearEntries: () => void,
  preserveLogs: boolean,
  enabledCategories: Record<FilterCategory, boolean>,
) {
  const listenerRef = useRef<((req: chrome.devtools.network.Request) => void) | null>(null);
  const enabledRef = useRef(enabledCategories);
  useEffect(() => { enabledRef.current = enabledCategories; }, [enabledCategories]);

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
      const category = categorize(contentType, url);
      if (!enabledRef.current[category]) return;

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
