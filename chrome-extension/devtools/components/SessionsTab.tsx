import React, { useState, useEffect, useCallback } from 'react';
import { MockrApi, type MemSessionInfo, type MemSessionActive, type MemSessionEntry } from '../../shared/api.js';

interface Props {
  api: MockrApi;
}

export function SessionsTab({ api }: Props) {
  const [sessions, setSessions] = useState<MemSessionInfo[]>([]);
  const [active, setActive] = useState<MemSessionActive | null>(null);
  const [newName, setNewName] = useState('');
  const [status, setStatus] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [entries, setEntries] = useState<MemSessionEntry[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await api.listMemSessions();
      setSessions(res.sessions);
      setActive(res.active);
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  // Poll while a session is actively recording — entryCount updates as requests come in.
  useEffect(() => {
    if (!active || active.mode !== 'record') return;
    const interval = setInterval(load, 1500);
    return () => clearInterval(interval);
  }, [active, load]);

  const loadEntries = useCallback(async (id: string) => {
    try {
      const detail = await api.getMemSession(id);
      setEntries(detail.entries);
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  }, [api]);

  const handleCreate = async () => {
    const name = newName.trim() || `session-${new Date().toISOString().slice(11, 19)}`;
    try {
      await api.createMemSession(name);
      setNewName('');
      setStatus(`Created: ${name}`);
      load();
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  };

  const handleActivate = async (id: string, mode: 'record' | 'replay') => {
    try {
      await api.activateMemSession(id, mode);
      setStatus(`${mode === 'record' ? 'Recording' : 'Replaying'} session`);
      load();
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  };

  const handleDeactivate = async () => {
    try {
      await api.deactivateMemSession();
      setStatus('Deactivated');
      load();
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteMemSession(id);
      if (expandedId === id) setExpandedId(null);
      setStatus('Deleted');
      load();
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  };

  const handleClear = async (id: string) => {
    try {
      await api.clearMemSession(id);
      setStatus('Cleared entries');
      load();
      if (expandedId === id) loadEntries(id);
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  };

  const handleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setEntries([]);
    } else {
      setExpandedId(id);
      loadEntries(id);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto">
      {/* Active banner */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50">
        {active ? (
          <>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              active.mode === 'record'
                ? 'bg-red-100 text-red-700'
                : 'bg-green-100 text-green-700'
            }`}>
              {active.mode === 'record' ? '● REC' : '▶ REPLAY'}
            </span>
            <span className="text-xs text-gray-700 font-mono">{active.name}</span>
            <button
              onClick={handleDeactivate}
              className="ml-auto px-2 py-0.5 text-[10px] rounded border border-gray-300 text-gray-600 hover:bg-gray-100"
            >
              Deactivate
            </button>
          </>
        ) : (
          <span className="text-xs text-gray-400">No active session</span>
        )}
      </div>

      {/* Create form */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          placeholder="New session name..."
          className="text-xs px-2 py-1 border border-gray-300 rounded flex-1"
        />
        <button
          onClick={handleCreate}
          className="px-2.5 py-1 text-xs rounded bg-purple-600 text-white hover:bg-purple-700"
        >
          Create
        </button>
        <button
          onClick={load}
          className="px-2.5 py-1 text-xs rounded border border-gray-300 text-gray-500 hover:bg-gray-100"
        >
          Refresh
        </button>
        {status && <span className="text-[10px] text-gray-500 truncate max-w-xs">{status}</span>}
      </div>

      {/* Sessions list */}
      {sessions.length === 0 ? (
        <div className="px-3 py-8 text-center text-xs text-gray-400">
          No sessions yet. Create one, activate it in <strong>record</strong> mode,
          load your page, then switch to <strong>replay</strong> for instant responses.
        </div>
      ) : (
        <table className="w-full border-collapse text-[11px]">
          <tbody>
            {sessions.map(s => {
              const isActive = active?.id === s.id;
              const isExpanded = expandedId === s.id;
              return (
                <React.Fragment key={s.id}>
                  <tr className={`border-b border-gray-100 hover:bg-gray-50 ${isActive ? 'bg-purple-50' : ''}`}>
                    <td className="w-6 px-2 py-1 text-center">
                      <button
                        onClick={() => handleExpand(s.id)}
                        className="text-[10px] text-gray-400 hover:text-gray-700"
                      >
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    </td>
                    <td className="px-3 py-1">
                      <span className="font-mono text-gray-700">{s.name}</span>
                    </td>
                    <td className="px-3 py-1 text-gray-500 whitespace-nowrap">
                      {s.entryCount} {s.entryCount === 1 ? 'entry' : 'entries'}
                    </td>
                    <td className="px-3 py-1 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleActivate(s.id, 'record')}
                          disabled={isActive && active?.mode === 'record'}
                          className={`px-2 py-0.5 text-[10px] rounded border ${
                            isActive && active?.mode === 'record'
                              ? 'border-red-500 bg-red-500 text-white cursor-not-allowed'
                              : 'border-red-500 text-red-600 hover:bg-red-500 hover:text-white'
                          }`}
                        >
                          ● Record
                        </button>
                        <button
                          onClick={() => handleActivate(s.id, 'replay')}
                          disabled={isActive && active?.mode === 'replay'}
                          className={`px-2 py-0.5 text-[10px] rounded border ${
                            isActive && active?.mode === 'replay'
                              ? 'border-green-600 bg-green-600 text-white cursor-not-allowed'
                              : 'border-green-600 text-green-600 hover:bg-green-600 hover:text-white'
                          }`}
                        >
                          ▶ Replay
                        </button>
                        <button
                          onClick={() => handleClear(s.id)}
                          className="px-2 py-0.5 text-[10px] rounded border border-gray-300 text-gray-500 hover:bg-gray-100"
                          title="Clear all cached entries"
                        >
                          Clear
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="px-1.5 py-0.5 text-[10px] rounded border border-red-400 text-red-500 hover:bg-red-500 hover:text-white"
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={4} className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                        {entries.length === 0 ? (
                          <div className="text-[10px] text-gray-400 italic">No cached entries</div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {entries.map((e, i) => (
                              <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                                <span className={`px-1 rounded ${
                                  e.status >= 200 && e.status < 300 ? 'bg-green-100 text-green-700' :
                                  e.status >= 400 ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {e.status}
                                </span>
                                <span className="text-gray-700 truncate">{e.key}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
