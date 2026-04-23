import React, { useState, useCallback, useMemo } from 'react';
import { MockrApi } from '../../shared/api.js';
import { useStore } from '../hooks/useStore.js';
import { useRecorder } from '../hooks/useRecorder.js';
import { Header } from './Header.js';
import { Toolbar } from './Toolbar.js';
import { EntriesTable } from './EntriesTable.js';
import { MockedTab } from './MockedTab.js';
import { SessionsTab } from './SessionsTab.js';

const TABS = ['Recording', 'Mocked', 'Sessions'] as const;

export function App() {
  const [serverUrl, setServerUrl] = useState('http://localhost:4000');
  const [editorScheme, setEditorScheme] = useState('vscode');
  const [activeTab, setActiveTab] = useState<string>('Recording');
  const [mapLoading, setMapLoading] = useState(false);

  const api = useMemo(() => new MockrApi(serverUrl), [serverUrl]);

  const store = useStore();
  const {
    entries, selectedIds, expandedId,
    filterText, methodFilter, isRecording, preserveLogs,
    setFilterText, setMethodFilter, setIsRecording, setPreserveLogs, setExpandedId,
    addEntry, clearEntries, toggleSelected, selectAll, clearSelection,
  } = store;

  useRecorder(isRecording, entries, addEntry, clearEntries, preserveLogs);

  // Persist server URL and editor scheme
  useState(() => {
    chrome.storage.local.get(['mockrServerUrl', 'mockrEditorScheme'], (r: Record<string, string>) => {
      if (r.mockrServerUrl) setServerUrl(r.mockrServerUrl);
      if (r.mockrEditorScheme) setEditorScheme(r.mockrEditorScheme);
    });
  });

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
    try {
      const selected = entries.filter(e => selectedIds.has(e.id));
      await api.mapEntries(selected.map(e => ({
        url: e.url, method: e.method, status: e.status, contentType: e.contentType, body: e.body,
      })));
      clearSelection();
      setActiveTab('Mocked');
    } catch (err) {
      console.error('[mockr] Map error:', err);
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
        <SessionsTab api={api} />
      )}
    </div>
  );
}
