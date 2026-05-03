import React, { useState, useCallback, useMemo } from 'react';
import { MockrApi } from '../../shared/api.js';
import { useStore } from '../hooks/useStore.js';
import { useRecorder } from '../hooks/useRecorder.js';
import { Header } from './Header.js';
import { Toolbar } from './Toolbar.js';
import { EntriesTable } from './EntriesTable.js';
import { MockedTab } from './MockedTab.js';
import { SessionsTab } from './SessionsTab.js';
import { DEFAULT_FILTER, FILTER_CATEGORIES, type FilterCategory } from '../../shared/recording-filter.js';

const TABS = ['Recording', 'Mocked', 'Sessions'] as const;

export function App() {
  const [serverUrl, setServerUrl] = useState('http://localhost:4000');
  const [editorScheme, setEditorScheme] = useState('vscode');
  const [activeTab, setActiveTab] = useState<string>('Recording');
  const [mapLoading, setMapLoading] = useState(false);
  const [mapToast, setMapToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [recordingFilter, setRecordingFilter] = useState<Record<FilterCategory, boolean>>(DEFAULT_FILTER);

  const api = useMemo(() => new MockrApi(serverUrl), [serverUrl]);

  const store = useStore();
  const {
    entries, selectedIds, expandedId,
    filterText, methodFilter, isRecording, preserveLogs,
    setFilterText, setMethodFilter, setIsRecording, setPreserveLogs, setExpandedId,
    addEntry, clearEntries, toggleSelected, selectAll, clearSelection,
  } = store;

  useRecorder(isRecording, entries, addEntry, clearEntries, preserveLogs, recordingFilter);

  // Persist server URL, editor scheme, and recording filter
  useState(() => {
    chrome.storage.local.get(
      ['mockrServerUrl', 'mockrEditorScheme', 'mockrRecordingFilter'],
      (r: { mockrServerUrl?: string; mockrEditorScheme?: string; mockrRecordingFilter?: Record<FilterCategory, boolean> }) => {
        if (r.mockrServerUrl) setServerUrl(r.mockrServerUrl);
        if (r.mockrEditorScheme) setEditorScheme(r.mockrEditorScheme);
        if (r.mockrRecordingFilter) setRecordingFilter({ ...DEFAULT_FILTER, ...r.mockrRecordingFilter });
      },
    );
  });

  const handleToggleCategory = useCallback((cat: FilterCategory) => {
    setRecordingFilter(prev => {
      const next = { ...prev, [cat]: !prev[cat] };
      chrome.storage.local.set({ mockrRecordingFilter: next });
      api.setSessionCaptureFilter(next).catch(() => { /* server unreachable — display-side filter still applies */ });
      return next;
    });
  }, [api]);

  const handleServerUrlChange = useCallback((url: string) => {
    setServerUrl(url);
    chrome.storage.local.set({ mockrServerUrl: url });
  }, []);

  const handleEditorSchemeChange = useCallback((s: string) => {
    setEditorScheme(s);
    chrome.storage.local.set({ mockrEditorScheme: s });
  }, []);

  const handleRecord = useCallback(() => {
    clearEntries();
    setIsRecording(true);
  }, [clearEntries, setIsRecording]);

  const handleStop = useCallback(() => {
    setIsRecording(false);
  }, [setIsRecording]);

  const handleMap = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setMapLoading(true);
    setMapToast(null);
    try {
      const selected = entries.filter(e => selectedIds.has(e.id));
      const withBody = selected.filter(e => e.body && e.body.length > 0);
      const skipped = selected.length - withBody.length;
      if (withBody.length === 0) {
        setMapToast({ kind: 'err', text: `No mappable entries — ${skipped} skipped (empty body).` });
        setMapLoading(false);
        return;
      }
      const result = await api.mapEntries(withBody.map(e => ({
        url: e.url, method: e.method, status: e.status, contentType: e.contentType, body: e.body,
      })));
      clearSelection();
      setActiveTab('Mocked');
      const mappedCount = (result as { mapped?: unknown[] }).mapped?.length ?? withBody.length;
      const skipNote = skipped > 0 ? ` (${skipped} skipped — empty body)` : '';
      setMapToast({ kind: 'ok', text: `Mapped ${mappedCount} endpoint${mappedCount === 1 ? '' : 's'}${skipNote}` });
    } catch (err) {
      setMapToast({ kind: 'err', text: (err as Error).message || 'Map failed' });
    }
    setMapLoading(false);
  }, [selectedIds, entries, api, clearSelection]);

  const totalSize = useMemo(() => entries.reduce((s, e) => s + e.size, 0), [entries]);

  return (
    <div className="flex flex-col h-screen overflow-hidden text-xs font-sans">
      <Header
        serverUrl={serverUrl}
        onServerUrlChange={handleServerUrlChange}
        editorScheme={editorScheme}
        onEditorSchemeChange={handleEditorSchemeChange}
      />
      <Toolbar
        isRecording={isRecording}
        selectedCount={selectedIds.size}
        entryCount={entries.length}
        totalSize={totalSize}
        preserveLogs={preserveLogs}
        onRecord={handleRecord}
        onStop={handleStop}
        onMap={handleMap}
        onClear={clearEntries}
        onPreserveLogsChange={setPreserveLogs}
        mapLoading={mapLoading}
      />

      {mapToast && (
        <div
          className={`flex items-center gap-2 px-3 py-1.5 text-xs border-b ${
            mapToast.kind === 'ok'
              ? 'bg-green-50 text-green-800 border-green-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <span className="flex-1 break-all">{mapToast.text}</span>
          <button
            onClick={() => setMapToast(null)}
            className="text-[10px] px-1.5 py-0.5 rounded border border-current opacity-60 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-xs cursor-pointer border-b-2 ${
              activeTab === tab
                ? 'text-purple-700 border-purple-700'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Recording' && (
        <EntriesTable
          entries={entries}
          selectedIds={selectedIds}
          expandedId={expandedId}
          methodFilter={methodFilter}
          filterText={filterText}
          onMethodFilterChange={setMethodFilter}
          onFilterTextChange={setFilterText}
          onToggleSelect={toggleSelected}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          onExpand={setExpandedId}
        />
      )}

      {activeTab === 'Mocked' && (
        <MockedTab api={api} editorScheme={editorScheme} />
      )}

      {activeTab === 'Sessions' && (
        <SessionsTab
          api={api}
          recordingFilter={recordingFilter}
          onToggleCategory={handleToggleCategory}
        />
      )}
    </div>
  );
}
