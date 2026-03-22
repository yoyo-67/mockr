import React, { useMemo } from 'react';
import type { MemoryEntry } from '../hooks/useStore.js';

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-green-600',
  POST: 'text-amber-600',
  PUT: 'text-blue-600',
  PATCH: 'text-purple-600',
  DELETE: 'text-red-600',
};

const METHODS = ['all', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function statusColor(s: number) {
  if (s < 300) return 'text-green-600';
  if (s < 400) return 'text-amber-600';
  return 'text-red-600';
}

function sizeStr(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function truncateUrl(url: string) {
  try { const u = new URL(url); return u.pathname + u.search; }
  catch { return url; }
}

interface Props {
  entries: MemoryEntry[];
  selectedIds: Set<string>;
  expandedId: string | null;
  methodFilter: string;
  filterText: string;
  onMethodFilterChange: (m: string) => void;
  onFilterTextChange: (t: string) => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClearSelection: () => void;
  onExpand: (id: string | null) => void;
}

export function EntriesTable({
  entries, selectedIds, expandedId,
  methodFilter, filterText,
  onMethodFilterChange, onFilterTextChange,
  onToggleSelect, onSelectAll, onClearSelection, onExpand,
}: Props) {
  const filtered = useMemo(() => {
    let list = entries;
    if (methodFilter !== 'all') list = list.filter(e => e.method === methodFilter);
    if (filterText) list = list.filter(e => e.url.toLowerCase().includes(filterText.toLowerCase()));
    return list;
  }, [entries, methodFilter, filterText]);

  const allSelected = filtered.length > 0 && filtered.every(e => selectedIds.has(e.id));

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Filters */}
      <div className="px-3 py-1.5 border-b border-gray-100 flex flex-col gap-1.5">
        <div className="flex gap-1">
          {METHODS.map(m => (
            <button
              key={m}
              onClick={() => onMethodFilterChange(m)}
              className={`px-2.5 py-0.5 text-[10px] rounded border cursor-pointer ${
                methodFilter === m
                  ? 'bg-purple-700 text-white border-purple-700'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-100'
              }`}
            >
              {m === 'all' ? 'All' : m}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={filterText}
          onChange={e => onFilterTextChange(e.target.value)}
          placeholder="Filter by URL..."
          className="w-full text-xs px-2 py-1 border border-gray-200 rounded"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0" style={{ maxHeight: expandedId ? '50%' : undefined }}>
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              <th className="w-8 px-2 py-1.5 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => allSelected ? onClearSelection() : onSelectAll(filtered.map(e => e.id))}
                  className="cursor-pointer"
                />
              </th>
              <th className="px-3 py-1.5 text-left font-semibold text-gray-500 text-[10px]">Method</th>
              <th className="px-3 py-1.5 text-left font-semibold text-gray-500 text-[10px]">URL</th>
              <th className="px-3 py-1.5 text-left font-semibold text-gray-500 text-[10px]">Status</th>
              <th className="px-3 py-1.5 text-left font-semibold text-gray-500 text-[10px]">Size</th>
              <th className="px-3 py-1.5 text-left font-semibold text-gray-500 text-[10px]">Time</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => (
              <tr
                key={e.id}
                onClick={() => onExpand(expandedId === e.id ? null : e.id)}
                className={`cursor-pointer border-b border-gray-50 hover:bg-purple-50/50 ${
                  expandedId === e.id ? 'bg-purple-50' : ''
                }`}
              >
                <td className="px-2 py-1 text-center" onClick={ev => ev.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(e.id)}
                    onChange={() => onToggleSelect(e.id)}
                    className="cursor-pointer"
                  />
                </td>
                <td className={`px-3 py-1 font-mono whitespace-nowrap ${METHOD_COLORS[e.method] || 'text-gray-600'}`}>
                  {e.method}
                </td>
                <td className="px-3 py-1 truncate max-w-[400px]" title={e.url}>
                  {truncateUrl(e.url)}
                </td>
                <td className={`px-3 py-1 whitespace-nowrap ${statusColor(e.status)}`}>{e.status}</td>
                <td className="px-3 py-1 whitespace-nowrap text-gray-500">{sizeStr(e.size)}</td>
                <td className="px-3 py-1 whitespace-nowrap text-gray-400">
                  {e.timing ? `${Math.round(e.timing)}ms` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {expandedId && (() => {
        const entry = entries.find(e => e.id === expandedId);
        if (!entry) return null;
        let bodyText: string;
        try { bodyText = JSON.stringify(JSON.parse(entry.body), null, 2); }
        catch { bodyText = entry.body; }
        return (
          <div className="flex flex-col flex-1 min-h-0 border-t-2 border-purple-700 bg-gray-50">
            <div className="flex justify-between items-center px-3 py-1.5 bg-gray-100 border-b border-gray-200 text-xs font-semibold">
              <span>{entry.method} {truncateUrl(entry.url)} — {entry.status}</span>
              <button
                onClick={() => onExpand(null)}
                className="px-2 py-0.5 text-[10px] rounded border border-gray-300 text-gray-500 hover:bg-gray-200"
              >
                Close
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-3 m-0 text-[11px] font-mono whitespace-pre-wrap break-all min-h-0">
              {bodyText}
            </pre>
          </div>
        );
      })()}
    </div>
  );
}
