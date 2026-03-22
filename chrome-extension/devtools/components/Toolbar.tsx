import React from 'react';

interface Props {
  isRecording: boolean;
  selectedCount: number;
  entryCount: number;
  totalSize: number;
  preserveLogs: boolean;
  onRecord: () => void;
  onStop: () => void;
  onMap: () => void;
  onClear: () => void;
  onPreserveLogsChange: (v: boolean) => void;
  mapLoading: boolean;
}

export function Toolbar({
  isRecording, selectedCount, entryCount, totalSize,
  preserveLogs, onRecord, onStop, onMap, onClear,
  onPreserveLogsChange, mapLoading,
}: Props) {
  const sizeStr = totalSize === 0 ? '' :
    totalSize < 1024 ? `${totalSize} B` :
    totalSize < 1024 * 1024 ? `${(totalSize / 1024).toFixed(1)} KB` :
    `${(totalSize / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200">
      <button
        onClick={isRecording ? onStop : onRecord}
        className={`px-2.5 py-1 text-xs rounded border ${
          isRecording
            ? 'bg-red-600 text-white border-red-600'
            : 'text-red-600 border-red-600 hover:bg-red-50'
        }`}
      >
        {isRecording ? '⏹ Stop' : '⏺ Record'}
      </button>
      <button
        onClick={onMap}
        disabled={selectedCount === 0 || mapLoading}
        className="px-2.5 py-1 text-xs rounded border border-purple-600 text-purple-600 hover:bg-purple-600 hover:text-white disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-purple-600"
      >
        {mapLoading ? 'Mapping...' : `Map to mockr${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
      </button>
      <button
        onClick={onClear}
        className="px-2.5 py-1 text-xs rounded border border-gray-300 text-gray-500 hover:bg-gray-100"
      >
        Clear
      </button>
      <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer ml-1">
        <input
          type="checkbox"
          checked={preserveLogs}
          onChange={e => onPreserveLogsChange(e.target.checked)}
          className="cursor-pointer"
        />
        Preserve log
      </label>
      <span className={`ml-auto text-xs ${isRecording ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
        {isRecording ? `Recording… (${entryCount})` : entryCount > 0 ? `${entryCount} entries` : 'Idle'}
      </span>
      {sizeStr && <span className="text-xs text-gray-400 ml-1">{sizeStr}</span>}
    </div>
  );
}
