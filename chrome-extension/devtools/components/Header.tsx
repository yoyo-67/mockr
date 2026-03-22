import React from 'react';

interface Props {
  serverUrl: string;
  onServerUrlChange: (url: string) => void;
  editorScheme: string;
  onEditorSchemeChange: (scheme: string) => void;
}

export function Header({ serverUrl, onServerUrlChange, editorScheme, onEditorSchemeChange }: Props) {
  return (
    <header className="flex items-center gap-4 px-3 py-2 border-b border-gray-200 bg-gray-50">
      <h1 className="text-sm font-bold text-purple-700">Mockr</h1>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <label>Server:</label>
        <input
          type="text"
          value={serverUrl}
          onChange={e => onServerUrlChange(e.target.value)}
          className="text-xs px-1.5 py-0.5 border border-gray-300 rounded w-48"
        />
        <label>Editor:</label>
        <select
          value={editorScheme}
          onChange={e => onEditorSchemeChange(e.target.value)}
          className="text-xs px-1.5 py-0.5 border border-gray-300 rounded"
        >
          <option value="vscode">VS Code</option>
          <option value="cursor">Cursor</option>
          <option value="webstorm">WebStorm</option>
          <option value="nvim">Neovim</option>
        </select>
      </div>
    </header>
  );
}
