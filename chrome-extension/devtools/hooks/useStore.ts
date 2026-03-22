import { useState, useEffect, useCallback, useRef } from 'react';

export interface MemoryEntry {
  id: string;
  url: string;
  method: string;
  status: number;
  contentType: string;
  responseHeaders: Record<string, string>;
  body: string;
  size: number;
  timing: number;
  timestamp: number;
}

interface PanelState {
  entries: MemoryEntry[];
  selectedIds: string[];
  filterText: string;
  methodFilter: string;
  isRecording: boolean;
  entryCounter: number;
  preserveLogs: boolean;
}

export function useStore() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterText, setFilterText] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [isRecording, setIsRecording] = useState(true);
  const [preserveLogs, setPreserveLogs] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const entryCounterRef = useRef(0);
  const initialized = useRef(false);

  // Persist state
  const saveState = useCallback(() => {
    const state: PanelState = {
      entries,
      selectedIds: [...selectedIds],
      filterText,
      methodFilter,
      isRecording,
      entryCounter: entryCounterRef.current,
      preserveLogs,
    };
    chrome.storage.local.set({ mockrPanelState: state });
  }, [entries, selectedIds, filterText, methodFilter, isRecording, preserveLogs]);

  useEffect(() => {
    if (initialized.current) saveState();
  }, [saveState]);

  // Restore state on mount
  useEffect(() => {
    chrome.storage.local.get('mockrPanelState', (result: Record<string, PanelState>) => {
      const s = result.mockrPanelState;
      if (s) {
        setEntries(s.entries || []);
        setSelectedIds(new Set(s.selectedIds || []));
        setFilterText(s.filterText || '');
        setMethodFilter(s.methodFilter || 'all');
        setIsRecording(s.isRecording ?? true);
        setPreserveLogs(s.preserveLogs ?? false);
        entryCounterRef.current = s.entryCounter || (s.entries?.length ?? 0);
      }
      initialized.current = true;
    });
  }, []);

  const addEntry = useCallback((entry: Omit<MemoryEntry, 'id'>) => {
    const id = `mem-${++entryCounterRef.current}`;
    setEntries(prev => [...prev, { ...entry, id }]);
  }, []);

  const clearEntries = useCallback(() => {
    setEntries([]);
    setSelectedIds(new Set());
    setExpandedId(null);
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    entries, setEntries,
    selectedIds, toggleSelected, selectAll, clearSelection,
    filterText, setFilterText,
    methodFilter, setMethodFilter,
    isRecording, setIsRecording,
    preserveLogs, setPreserveLogs,
    expandedId, setExpandedId,
    addEntry, clearEntries,
    entryCounterRef,
  };
}
