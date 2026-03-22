import React, { useState, useEffect, useMemo } from 'react';
import { MockrApi } from '../../shared/api.js';

interface Endpoint {
  url: string;
  method: string;
  type: string;
  enabled: boolean;
  filePath?: string | null;
}

function getEditorUrl(scheme: string, filePath: string): string {
  switch (scheme) {
    case 'cursor': return `cursor://file${filePath}`;
    case 'webstorm': return `webstorm://open?file=${filePath}`;
    case 'nvim': return `nvim://${filePath}`;
    default: return `vscode://file${filePath}`;
  }
}


interface FolderData {
  // Maps endpoint key (url|method) to folder name. Unassigned = flat list.
  assignments: Record<string, string>;
  // Folder order + collapsed state
  collapsed: Record<string, boolean>;
}

function epKey(ep: { url: string; method: string }) {
  return `${ep.method}|${ep.url}`;
}

interface Props {
  api: MockrApi;
  editorScheme: string;
}

export function MockedTab({ api, editorScheme }: Props) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [status, setStatus] = useState('');
  const [folderData, setFolderData] = useState<FolderData>({ assignments: {}, collapsed: {} });
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);

  useEffect(() => {
    chrome.storage.local.get('mockrFolders2', (r: Record<string, FolderData>) => {
      if (r.mockrFolders2) setFolderData(r.mockrFolders2);
    });
  }, []);

  const saveFolderData = (fd: FolderData) => {
    setFolderData(fd);
    chrome.storage.local.set({ mockrFolders2: fd });
  };

  const load = async () => {
    try { setEndpoints(await api.listEndpoints()); }
    catch (err) { setStatus(`Error: ${(err as Error).message}`); }
  };

  useEffect(() => { load(); }, []);

  // Split into folders + flat
  const { folders, flatEndpoints } = useMemo(() => {
    // All folder names: from assignments + from collapsed keys (empty folders)
    const allNames = new Set([
      ...Object.values(folderData.assignments),
      ...Object.keys(folderData.collapsed),
    ]);
    const folderNames = [...allNames].sort();
    const folders: { name: string; endpoints: Endpoint[] }[] = [];
    const flat: Endpoint[] = [];

    for (const name of folderNames) {
      const eps = endpoints.filter(ep => folderData.assignments[epKey(ep)] === name);
      folders.push({ name, endpoints: eps });
    }

    for (const ep of endpoints) {
      if (!folderData.assignments[epKey(ep)]) flat.push(ep);
    }

    return { folders, flatEndpoints: flat };
  }, [endpoints, folderData]);

  const handleToggle = async (ep: Endpoint, enabled: boolean) => {
    await api.toggleEndpoint(ep.url, enabled, ep.method);
    setEndpoints(prev => prev.map(e => e.url === ep.url && e.method === ep.method ? { ...e, enabled } : e));
  };

  const handleTypeChange = async (ep: Endpoint, type: string) => {
    try {
      await api.updateEndpointType(ep.url, type, ep.method);
      setEndpoints(prev => prev.map(e => e.url === ep.url && e.method === ep.method ? { ...e, type } : e));
    } catch (err) { setStatus(`Error: ${(err as Error).message}`); }
  };

  const handleDelete = async (ep: Endpoint) => {
    try {
      await api.deleteEndpoint(ep.url, ep.method);
      setEndpoints(prev => prev.filter(e => !(e.url === ep.url && e.method === ep.method)));
      // Remove from folder assignments
      const next = { ...folderData, assignments: { ...folderData.assignments } };
      delete next.assignments[epKey(ep)];
      saveFolderData(next);
      setStatus(`Deleted: ${ep.url}`);
    } catch (err) { setStatus(`Error: ${(err as Error).message}`); }
  };

  const toggleFolder = (name: string) => {
    saveFolderData({
      ...folderData,
      collapsed: { ...folderData.collapsed, [name]: !folderData.collapsed[name] },
    });
  };

  const deleteFolder = (name: string) => {
    const next = { ...folderData, assignments: { ...folderData.assignments }, collapsed: { ...folderData.collapsed } };
    // Move all endpoints back to flat
    for (const [key, folder] of Object.entries(next.assignments)) {
      if (folder === name) delete next.assignments[key];
    }
    delete next.collapsed[name];
    saveFolderData(next);
  };

  const handleDropOnFolder = (folderName: string) => {
    if (!draggedKey) return;
    saveFolderData({
      ...folderData,
      assignments: { ...folderData.assignments, [draggedKey]: folderName },
    });
    setDraggedKey(null);
  };

  const handleDropOnFlat = () => {
    if (!draggedKey) return;
    const next = { ...folderData, assignments: { ...folderData.assignments } };
    delete next.assignments[draggedKey];
    saveFolderData(next);
    setDraggedKey(null);
  };

  const createFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    const next = { ...folderData, assignments: { ...folderData.assignments }, collapsed: { ...folderData.collapsed } };
    // If an endpoint was dragged, assign it to this folder
    if (draggedKey) {
      next.assignments[draggedKey] = name;
      setDraggedKey(null);
    }
    // Ensure folder exists even if empty (add a collapsed entry)
    next.collapsed[name] = next.collapsed[name] ?? false;
    saveFolderData(next);
    setNewFolderName('');
    setShowNewFolder(false);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={load} className="px-2.5 py-1 text-xs rounded border border-gray-300 text-gray-500 hover:bg-gray-100">
          Refresh
        </button>
        {status && <span className="text-xs text-gray-500">{status}</span>}
      </div>

      {/* Folders */}
      {folders.map(({ name, endpoints: eps }) => (
        <div
          key={name}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
          onDrop={e => { e.preventDefault(); handleDropOnFolder(name); }}
        >
          <div
            className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 border-y border-gray-200 cursor-pointer hover:bg-gray-200 select-none"
          >
            <input
              type="checkbox"
              checked={eps.every(ep => ep.enabled)}
              onChange={async (e) => {
                const enabled = e.target.checked;
                for (const ep of eps) await handleToggle(ep, enabled);
              }}
              onClick={e => e.stopPropagation()}
              className="cursor-pointer"
              title={eps.every(ep => ep.enabled) ? 'Disable all in folder' : 'Enable all in folder'}
            />
            <span className="text-[10px] text-gray-400" onClick={() => toggleFolder(name)}>
              {folderData.collapsed[name] ? '▶' : '▼'}
            </span>
            <span className="text-[11px] font-semibold text-gray-600" onClick={() => toggleFolder(name)}>
              📁 {name}
            </span>
            <span className="text-[10px] text-gray-400 ml-1">({eps.length})</span>
            <button
              onClick={() => deleteFolder(name)}
              className="ml-auto text-[10px] text-gray-400 hover:text-red-500 px-1"
              title="Remove folder (endpoints go back to flat list)"
            >
              ×
            </button>
          </div>
          {!folderData.collapsed[name] && (
            <EndpointTable
              endpoints={eps}
              api={api}
              editorScheme={editorScheme}
              onToggle={handleToggle}
              onTypeChange={handleTypeChange}
              onDelete={handleDelete}
              onStatus={setStatus}
              onDragStart={setDraggedKey}
            />
          )}
        </div>
      ))}

      {/* New folder input — always visible */}
      {showNewFolder ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border-b border-purple-200">
          <span className="text-xs text-purple-700">Folder name:</span>
          <input
            autoFocus
            type="text"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
            className="text-xs px-2 py-1 border border-purple-300 rounded flex-1"
            placeholder="e.g. Auth, Projects, Users..."
          />
          <button onClick={createFolder} className="px-2 py-1 text-xs rounded bg-purple-600 text-white hover:bg-purple-700">
            Create
          </button>
          <button onClick={() => setShowNewFolder(false)} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-500">
            Cancel
          </button>
        </div>
      ) : (
        <div
          onClick={() => setShowNewFolder(true)}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
          onDrop={e => { e.preventDefault(); setShowNewFolder(true); }}
          className="mx-3 my-1 py-1.5 border border-dashed border-gray-300 rounded text-center text-[11px] text-gray-400 cursor-pointer hover:border-purple-400 hover:text-purple-500 hover:bg-purple-50"
        >
          + New folder
        </div>
      )}

      {/* Flat list (unassigned endpoints) */}
      <div
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
        onDrop={e => { e.preventDefault(); handleDropOnFlat(); }}
      >
        <EndpointTable
          endpoints={flatEndpoints}
          api={api}
          editorScheme={editorScheme}
          onToggle={handleToggle}
          onTypeChange={handleTypeChange}
          onDelete={handleDelete}
          onStatus={setStatus}
          onDragStart={setDraggedKey}
        />
      </div>
    </div>
  );
}

function EndpointTable({ endpoints, api, editorScheme, onToggle, onTypeChange, onDelete, onStatus, onDragStart }: {
  endpoints: Endpoint[];
  api: MockrApi;
  editorScheme: string;
  onToggle: (ep: Endpoint, enabled: boolean) => void;
  onTypeChange: (ep: Endpoint, type: string) => void;
  onDelete: (ep: Endpoint) => void;
  onStatus: (s: string) => void;
  onDragStart: (key: string) => void;
}) {
  if (endpoints.length === 0) return null;
  return (
    <table className="w-full border-collapse text-[11px]">
      <tbody>
        {endpoints.map((ep, i) => (
          <EndpointRow
            key={`${ep.url}-${ep.method}-${i}`}
            ep={ep} api={api} editorScheme={editorScheme}
            onToggle={onToggle} onTypeChange={onTypeChange} onDelete={onDelete} onStatus={onStatus}
            onDragStart={() => onDragStart(epKey(ep))}
          />
        ))}
      </tbody>
    </table>
  );
}

function EndpointRow({ ep, api, editorScheme, onToggle, onTypeChange, onDelete, onStatus, onDragStart }: {
  ep: Endpoint; api: MockrApi; editorScheme: string;
  onToggle: (ep: Endpoint, enabled: boolean) => void;
  onTypeChange: (ep: Endpoint, type: string) => void;
  onDelete: (ep: Endpoint) => void;
  onStatus: (s: string) => void;
  onDragStart: () => void;
}) {
  const [url, setUrl] = useState(ep.url);
  const changed = url !== ep.url;

  const saveUrl = async () => {
    if (!changed) return;
    try {
      await api.updateEndpointUrl(ep.url, url, ep.method);
      onStatus(`Updated: ${ep.url} → ${url}`);
      ep.url = url;
    } catch (err) { onStatus(`Error: ${(err as Error).message}`); }
  };

  const mc: Record<string, string> = {
    GET: 'text-green-600', POST: 'text-amber-600', PUT: 'text-blue-600',
    PATCH: 'text-purple-600', DELETE: 'text-red-600',
  };

  return (
    <tr draggable onDragStart={onDragStart} className="border-b border-gray-50 hover:bg-gray-50 cursor-grab active:cursor-grabbing">
      <td className="w-8 px-2 py-1 text-center">
        <input type="checkbox" checked={ep.enabled} onChange={e => onToggle(ep, e.target.checked)} className="cursor-pointer" />
      </td>
      <td className={`px-3 py-1 font-mono whitespace-nowrap ${mc[ep.method] || 'text-gray-600'}`}>{ep.method}</td>
      <td className="px-3 py-1">
        <input type="text" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveUrl()}
          className="w-full text-[11px] font-mono px-1 py-0.5 border border-transparent rounded hover:border-gray-200 focus:border-purple-600 focus:outline-none bg-transparent" />
      </td>
      <td className="px-3 py-1">
        <select value={ep.type} onChange={e => onTypeChange(ep, e.target.value)}
          className="text-[10px] px-1 py-0.5 border border-gray-200 rounded bg-white cursor-pointer">
          <option value="static">static</option>
          <option value="handler">handler</option>
          <option value="data">data</option>
        </select>
      </td>
      <td className="px-3 py-1">
        <div className="flex items-center gap-1">
          {changed && <button onClick={saveUrl} className="px-2 py-0.5 text-[10px] rounded border border-purple-600 text-purple-600 hover:bg-purple-600 hover:text-white">Save</button>}
          {ep.filePath && <a href={getEditorUrl(editorScheme, ep.filePath)} title={ep.filePath} className="px-2 py-0.5 text-[10px] rounded border border-green-600 text-green-600 hover:bg-green-600 hover:text-white no-underline cursor-pointer">Open</a>}
        </div>
      </td>
      <td className="w-8 px-2 py-1 text-center">
        <button onClick={() => onDelete(ep)} className="px-1.5 py-0.5 text-[10px] rounded border border-red-400 text-red-500 hover:bg-red-500 hover:text-white">×</button>
      </td>
    </tr>
  );
}
