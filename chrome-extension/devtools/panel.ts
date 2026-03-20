import { MockrApi } from '../shared/api.js';
import type { RecordedEntry, SessionInfo } from '../shared/types.js';

// State
let api: MockrApi;
let sessionId: string | null = null;
let isRecording = false;
let entries: RecordedEntry[] = [];
let totalSize = 0;
let sortKey = 'timestamp';
let sortAsc = true;
let filterText = '';
const selectedEntries = new Set<string>();

// DOM elements
const serverUrlInput = document.getElementById('server-url') as HTMLInputElement;
const btnRecord = document.getElementById('btn-record') as HTMLButtonElement;
const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
const btnMap = document.getElementById('btn-map') as HTMLButtonElement;
const btnSelectAllApi = document.getElementById('btn-select-all') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const totalSizeEl = document.getElementById('total-size') as HTMLSpanElement;
const entriesBody = document.getElementById('entries-body') as HTMLTableSectionElement;
const filterInput = document.getElementById('filter-input') as HTMLInputElement;
const sessionsBody = document.getElementById('sessions-body') as HTMLTableSectionElement;
const btnRefreshSessions = document.getElementById('btn-refresh-sessions') as HTMLButtonElement;
const checkAll = document.getElementById('check-all') as HTMLInputElement;

// Init
api = new MockrApi(serverUrlInput.value);

serverUrlInput.addEventListener('change', () => {
  api.setServerUrl(serverUrlInput.value);
  chrome.storage.local.set({ mockrServerUrl: serverUrlInput.value });
});

chrome.storage.local.get('mockrServerUrl', (result: Record<string, string>) => {
  if (result.mockrServerUrl) {
    serverUrlInput.value = result.mockrServerUrl;
    api.setServerUrl(result.mockrServerUrl);
  }
});

// Tab switching
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    tab.classList.add('active');
    const tabName = (tab as HTMLElement).dataset.tab!;
    document.getElementById(`tab-${tabName}`)!.classList.add('active');
    if (tabName === 'sessions') loadSessions();
  });
});

// Record button
btnRecord.addEventListener('click', async () => {
  if (isRecording) return;
  try {
    const name = `recording-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}`;
    const baseUrl = await getPageUrl();
    const result = await api.startRecording(name, baseUrl);
    sessionId = result.sessionId;
    isRecording = true;
    entries = [];
    totalSize = 0;
    selectedEntries.clear();
    updateUI();
    startNetworkListener();
  } catch (err) {
    statusEl.textContent = `Error: ${(err as Error).message}`;
  }
});

// Stop button
btnStop.addEventListener('click', async () => {
  if (!isRecording || !sessionId) return;
  try {
    stopNetworkListener();
    await api.stopRecording(sessionId);
    isRecording = false;
    updateUI();
    statusEl.textContent = `Saved ${entries.length} entries`;
  } catch (err) {
    statusEl.textContent = `Error: ${(err as Error).message}`;
  }
});

// Map to mockr button
btnMap.addEventListener('click', async () => {
  if (selectedEntries.size === 0 || !sessionId) return;
  try {
    btnMap.disabled = true;
    btnMap.textContent = 'Mapping...';
    const entryIds = [...selectedEntries];
    const result = await api.mapToMockr(sessionId, entryIds);
    statusEl.textContent = `Mapped ${result.mapped.length} endpoints`;
    btnMap.textContent = 'Map to mockr';
    updateUI();
  } catch (err) {
    statusEl.textContent = `Map error: ${(err as Error).message}`;
    btnMap.textContent = 'Map to mockr';
    btnMap.disabled = false;
  }
});

// Select All API entries (filters out static assets)
btnSelectAllApi.addEventListener('click', () => {
  const apiEntries = entries.filter(e =>
    e.url.includes('/api/') && e.method === 'GET' && e.status >= 200 && e.status < 400
  );
  selectedEntries.clear();
  for (const e of apiEntries) selectedEntries.add(e.id);
  renderEntries();
  updateUI();
});

// Check all
checkAll.addEventListener('change', () => {
  const filtered = getFilteredEntries();
  if (checkAll.checked) {
    for (const e of filtered) selectedEntries.add(e.id);
  } else {
    for (const e of filtered) selectedEntries.delete(e.id);
  }
  renderEntries();
  updateUI();
});

// Filter
filterInput.addEventListener('input', () => {
  filterText = filterInput.value.toLowerCase();
  renderEntries();
});

// Sortable columns
document.querySelectorAll('th.sortable').forEach((th) => {
  th.addEventListener('click', () => {
    const key = (th as HTMLElement).dataset.sort!;
    if (sortKey === key) {
      sortAsc = !sortAsc;
    } else {
      sortKey = key;
      sortAsc = true;
    }
    renderEntries();
  });
});

// Sessions
btnRefreshSessions.addEventListener('click', loadSessions);

async function loadSessions() {
  try {
    const sessions = await api.listSessions();
    renderSessions(sessions);
  } catch (err) {
    sessionsBody.innerHTML = `<tr><td colspan="4">Error: ${(err as Error).message}</td></tr>`;
  }
}

function renderSessions(sessions: SessionInfo[]) {
  sessionsBody.innerHTML = '';
  for (const s of sessions) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(s.name)}</td>
      <td>${s.entryCount}</td>
      <td>${new Date(s.startedAt).toLocaleString()}</td>
      <td class="sessions-actions">
        <button class="btn btn-map" data-session-id="${s.id}">View & Map</button>
        <button class="btn btn-delete" data-session-id="${s.id}">Delete</button>
      </td>
    `;

    const mapBtn = tr.querySelector('.btn-map') as HTMLButtonElement;
    mapBtn.addEventListener('click', () => loadSessionEntries(s.id));

    const deleteBtn = tr.querySelector('.btn-delete') as HTMLButtonElement;
    deleteBtn.addEventListener('click', async () => {
      await api.deleteSession(s.id);
      loadSessions();
    });

    sessionsBody.appendChild(tr);
  }
}

async function loadSessionEntries(sid: string) {
  try {
    const session = await api.getSession(sid);
    sessionId = sid;
    entries = session.entries;
    totalSize = entries.reduce((sum, e) => sum + e.size, 0);
    selectedEntries.clear();
    isRecording = false;

    // Switch to recording tab to show entries
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelector('[data-tab="recording"]')!.classList.add('active');
    document.getElementById('tab-recording')!.classList.add('active');

    renderEntries();
    updateUI();
    statusEl.textContent = `Loaded session: ${session.name} (${entries.length} entries)`;
  } catch (err) {
    statusEl.textContent = `Error: ${(err as Error).message}`;
  }
}

// Network recording
let networkListener: ((request: chrome.devtools.network.Request) => void) | null = null;

function startNetworkListener() {
  networkListener = (request: chrome.devtools.network.Request) => {
    if (!isRecording || !sessionId) return;

    const entry = request;
    const url = entry.request.url;
    const method = entry.request.method;
    const status = entry.response.status;
    const contentType = entry.response.content.mimeType || 'application/octet-stream';
    const timing = entry.time || 0;

    const responseHeaders: Record<string, string> = {};
    for (const h of entry.response.headers) {
      responseHeaders[h.name.toLowerCase()] = h.value;
    }

    entry.getContent((content: string, _encoding: string) => {
      if (!isRecording || !sessionId) return;

      const body = content || '';
      const sid = sessionId;

      api.recordEntry(sid, {
        url, method, status, contentType, responseHeaders, body, timing,
      }).then((recorded) => {
        entries.push(recorded);
        totalSize += recorded.size;
        renderEntries();
        updateTotalSize();
      }).catch((err) => {
        console.error('[mockr] Failed to record entry:', err);
      });
    });
  };

  chrome.devtools.network.onRequestFinished.addListener(networkListener as any);
}

function stopNetworkListener() {
  if (networkListener) {
    chrome.devtools.network.onRequestFinished.removeListener(networkListener as any);
    networkListener = null;
  }
}

// Rendering
function getFilteredEntries(): RecordedEntry[] {
  return filterText
    ? entries.filter(e => e.url.toLowerCase().includes(filterText))
    : entries;
}

function updateUI() {
  btnRecord.disabled = isRecording;
  btnRecord.classList.toggle('recording', isRecording);
  btnStop.disabled = !isRecording;
  btnMap.disabled = selectedEntries.size === 0 || !sessionId;

  if (isRecording) {
    statusEl.textContent = `Recording... (${entries.length} entries)`;
    statusEl.className = 'status recording';
  } else if (statusEl.className !== 'status') {
    // Keep existing status message
  } else {
    statusEl.textContent = entries.length > 0 ? `${entries.length} entries` : 'Idle';
  }

  updateTotalSize();
}

function updateTotalSize() {
  if (totalSize === 0) {
    totalSizeEl.textContent = '';
  } else if (totalSize < 1024) {
    totalSizeEl.textContent = `${totalSize} B`;
  } else if (totalSize < 1024 * 1024) {
    totalSizeEl.textContent = `${(totalSize / 1024).toFixed(1)} KB`;
  } else {
    totalSizeEl.textContent = `${(totalSize / (1024 * 1024)).toFixed(1)} MB`;
  }
}

function renderEntries() {
  const filtered = getFilteredEntries();

  const sorted = [...filtered].sort((a, b) => {
    const av = (a as any)[sortKey];
    const bv = (b as any)[sortKey];
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortAsc ? cmp : -cmp;
  });

  entriesBody.innerHTML = '';
  for (const e of sorted) {
    const tr = document.createElement('tr');
    const methodClass = `method-${e.method.toLowerCase()}`;
    const statusClass = e.status < 300 ? 'status-2xx' : e.status < 400 ? 'status-3xx' : 'status-4xx';
    const sizeStr = e.size < 1024 ? `${e.size} B` :
      e.size < 1024 * 1024 ? `${(e.size / 1024).toFixed(1)} KB` :
      `${(e.size / (1024 * 1024)).toFixed(1)} MB`;
    const checked = selectedEntries.has(e.id) ? 'checked' : '';

    tr.innerHTML = `
      <td class="col-check"><input type="checkbox" data-entry-id="${e.id}" ${checked} /></td>
      <td class="${methodClass}">${e.method}</td>
      <td title="${escapeHtml(e.url)}">${escapeHtml(truncateUrl(e.url))}</td>
      <td class="${statusClass}">${e.status}</td>
      <td>${sizeStr}</td>
      <td>${e.timing ? `${Math.round(e.timing)}ms` : '-'}</td>
    `;

    const checkbox = tr.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedEntries.add(e.id);
      } else {
        selectedEntries.delete(e.id);
      }
      updateUI();
    });

    entriesBody.appendChild(tr);
  }

  updateUI();
}

// Helpers
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncateUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function getPageUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval('location.origin', (result: unknown) => {
      resolve((result as string) || '');
    });
  });
}
