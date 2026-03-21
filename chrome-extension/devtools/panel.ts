import { MockrApi } from '../shared/api.js';
import type { SessionInfo } from '../shared/types.js';

interface MemoryEntry {
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

// State
let api: MockrApi;
let isRecording = true;
let entries: MemoryEntry[] = [];
let totalSize = 0;
let sortKey = 'timestamp';
let sortAsc = true;
let filterText = '';
let activeMethodFilter = 'all';
const selectedEntries = new Set<string>();
let entryCounter = 0;
let expandedEntryId: string | null = null;

// DOM
const serverUrlInput = document.getElementById('server-url') as HTMLInputElement;
const btnRecord = document.getElementById('btn-record') as HTMLButtonElement;
const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
const btnMap = document.getElementById('btn-map') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const preserveLogsCheckbox = document.getElementById('preserve-logs') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const totalSizeEl = document.getElementById('total-size') as HTMLSpanElement;
const entriesBody = document.getElementById('entries-body') as HTMLTableSectionElement;
const filterInput = document.getElementById('filter-input') as HTMLInputElement;
const sessionsBody = document.getElementById('sessions-body') as HTMLTableSectionElement;
const btnRefreshSessions = document.getElementById('btn-refresh-sessions') as HTMLButtonElement;
const checkAll = document.getElementById('check-all') as HTMLInputElement;
const entryDetail = document.getElementById('entry-detail') as HTMLDivElement;
const detailTitle = document.getElementById('detail-title') as HTMLSpanElement;
const detailBody = document.getElementById('detail-body') as HTMLPreElement;
const detailClose = document.getElementById('detail-close') as HTMLButtonElement;

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

// Tabs
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    tab.classList.add('active');
    const tabName = (tab as HTMLElement).dataset.tab!;
    document.getElementById(`tab-${tabName}`)!.classList.add('active');
    if (tabName === 'sessions') loadSessions();
    if (tabName === 'mocked') loadMockedEndpoints();
  });
});

// Record / Stop
btnRecord.addEventListener('click', () => {
  isRecording = true;
  entries = [];
  totalSize = 0;
  selectedEntries.clear();
  closeDetail();
  startNetworkListener();
  updateUI();
});

btnStop.addEventListener('click', () => {
  isRecording = false;
  stopNetworkListener();
  updateUI();
  statusEl.textContent = `${entries.length} entries captured`;
});

// Clear
btnClear.addEventListener('click', () => {
  entries = [];
  totalSize = 0;
  selectedEntries.clear();
  closeDetail();
  renderEntries();
  updateUI();
});

// Preserve logs — clear on page navigation when unchecked
chrome.devtools.network.onNavigated.addListener(() => {
  if (!preserveLogsCheckbox.checked) {
    entries = [];
    totalSize = 0;
    selectedEntries.clear();
    closeDetail();
    renderEntries();
    updateUI();
  }
});

// Map to mockr
btnMap.addEventListener('click', async () => {
  if (selectedEntries.size === 0) return;
  try {
    btnMap.disabled = true;
    btnMap.textContent = 'Mapping...';
    const selected = entries.filter(e => selectedEntries.has(e.id));
    const result = await api.mapEntries(selected.map(e => ({
      url: e.url, method: e.method, status: e.status, contentType: e.contentType, body: e.body,
    })));
    statusEl.textContent = `Mapped ${result.mapped.length} endpoints`;
    btnMap.textContent = 'Map to mockr';

    // Clear selections after mapping (g)
    selectedEntries.clear();
    renderEntries();
    updateUI();

    // Switch to Mocked tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelector('[data-tab="mocked"]')!.classList.add('active');
    document.getElementById('tab-mocked')!.classList.add('active');
    loadMockedEndpoints();
  } catch (err) {
    statusEl.textContent = `Map error: ${(err as Error).message}`;
    btnMap.textContent = 'Map to mockr';
    btnMap.disabled = false;
  }
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

// URL filter
filterInput.addEventListener('input', () => {
  filterText = filterInput.value.toLowerCase();
  renderEntries();
});

// Sortable columns
document.querySelectorAll('th.sortable').forEach((th) => {
  th.addEventListener('click', () => {
    const key = (th as HTMLElement).dataset.sort!;
    if (sortKey === key) sortAsc = !sortAsc;
    else { sortKey = key; sortAsc = true; }
    renderEntries();
  });
});

// Method filters (e)
document.querySelectorAll('.method-filter').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.method-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeMethodFilter = (btn as HTMLElement).dataset.method!;
    renderEntries();
  });
});

// Detail panel close (f)
detailClose.addEventListener('click', closeDetail);

function closeDetail() {
  entryDetail.style.display = 'none';
  expandedEntryId = null;
}

function showDetail(entry: MemoryEntry) {
  expandedEntryId = entry.id;
  detailTitle.textContent = `${entry.method} ${truncateUrl(entry.url)} — ${entry.status}`;
  try {
    detailBody.textContent = JSON.stringify(JSON.parse(entry.body), null, 2);
  } catch {
    detailBody.textContent = entry.body;
  }
  entryDetail.style.display = 'flex';
}

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
        <button class="btn btn-delete" data-session-id="${s.id}">Delete</button>
      </td>
    `;
    const deleteBtn = tr.querySelector('.btn-delete') as HTMLButtonElement;
    deleteBtn.addEventListener('click', async () => {
      await api.deleteSession(s.id);
      loadSessions();
    });
    sessionsBody.appendChild(tr);
  }
}

// Network recording — in-memory, XHR only
let networkListener: ((request: chrome.devtools.network.Request) => void) | null = null;

function isXhr(mimeType: string, url: string): boolean {
  const ct = mimeType.toLowerCase();
  const u = url.toLowerCase();
  if (ct.includes('image') || u.endsWith('.svg')) return false;
  return ct.includes('json') || ct.includes('xml') || ct.includes('text/plain') || u.includes('/api/');
}

function startNetworkListener() {
  if (networkListener) return;
  networkListener = (request: chrome.devtools.network.Request) => {
    if (!isRecording) return;
    const url = request.request.url;
    const method = request.request.method;
    const status = request.response.status;
    const contentType = request.response.content.mimeType || 'application/octet-stream';
    const timing = request.time || 0;
    if (!isXhr(contentType, url)) return;

    const responseHeaders: Record<string, string> = {};
    for (const h of request.response.headers) responseHeaders[h.name.toLowerCase()] = h.value;

    request.getContent((content: string, _encoding: string) => {
      if (!isRecording) return;
      const body = content || '';
      // Skip if we already have this URL+timestamp from background capture (within 2s)
      const isDup = entries.some(e => e.url === url && e.method === method && Math.abs(e.timestamp - Date.now()) < 2000);
      if (isDup) return;
      const entry: MemoryEntry = {
        id: `mem-${++entryCounter}`,
        url, method, status, contentType, responseHeaders, body,
        size: body.length, timing, timestamp: Date.now(),
      };
      entries.push(entry);
      totalSize += entry.size;
      renderEntries();
      updateTotalSize();
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
function getFilteredEntries(): MemoryEntry[] {
  let filtered = entries;
  if (activeMethodFilter !== 'all') {
    filtered = filtered.filter(e => e.method === activeMethodFilter);
  }
  if (filterText) {
    filtered = filtered.filter(e => e.url.toLowerCase().includes(filterText));
  }
  return filtered;
}

function updateUI() {
  btnRecord.disabled = isRecording;
  btnRecord.classList.toggle('recording', isRecording);
  btnStop.disabled = !isRecording;
  btnMap.disabled = selectedEntries.size === 0;

  if (isRecording) {
    statusEl.textContent = `Recording... (${entries.length} entries)`;
    statusEl.className = 'status recording';
  } else {
    statusEl.textContent = entries.length > 0 ? `${entries.length} entries captured` : 'Idle';
    statusEl.className = 'status';
  }
  updateTotalSize();
  saveState();
}

function updateTotalSize() {
  if (totalSize === 0) totalSizeEl.textContent = '';
  else if (totalSize < 1024) totalSizeEl.textContent = `${totalSize} B`;
  else if (totalSize < 1024 * 1024) totalSizeEl.textContent = `${(totalSize / 1024).toFixed(1)} KB`;
  else totalSizeEl.textContent = `${(totalSize / (1024 * 1024)).toFixed(1)} MB`;
}

function renderEntries() {
  const filtered = getFilteredEntries();
  const sorted = [...filtered].sort((a, b) => {
    const av = (a as any)[sortKey];
    const bv = (b as any)[sortKey];
    return sortAsc ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
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

    if (expandedEntryId === e.id) tr.classList.add('entry-selected');

    tr.innerHTML = `
      <td class="col-check"><input type="checkbox" data-entry-id="${e.id}" ${checked} /></td>
      <td class="${methodClass}">${e.method}</td>
      <td class="entry-url" title="${escapeHtml(e.url)}">${escapeHtml(truncateUrl(e.url))}</td>
      <td class="${statusClass}">${e.status}</td>
      <td>${sizeStr}</td>
      <td>${e.timing ? `${Math.round(e.timing)}ms` : '-'}</td>
    `;

    const checkbox = tr.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.addEventListener('change', (ev) => {
      ev.stopPropagation();
      if (checkbox.checked) selectedEntries.add(e.id);
      else selectedEntries.delete(e.id);
      updateUI();
    });

    // Click row to show detail (f)
    tr.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).tagName === 'INPUT') return;
      if (expandedEntryId === e.id) { closeDetail(); renderEntries(); }
      else { showDetail(e); renderEntries(); }
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
  try { const u = new URL(url); return u.pathname + u.search; }
  catch { return url; }
}

// Mocked endpoints tab
const mockedBody = document.getElementById('mocked-body') as HTMLTableSectionElement;
const btnRefreshMocked = document.getElementById('btn-refresh-mocked') as HTMLButtonElement;
btnRefreshMocked.addEventListener('click', loadMockedEndpoints);

const editorScheme = document.getElementById('editor-scheme') as HTMLSelectElement;
chrome.storage.local.get('mockrEditorScheme', (result: Record<string, string>) => {
  if (result.mockrEditorScheme) editorScheme.value = result.mockrEditorScheme;
});
editorScheme.addEventListener('change', () => {
  chrome.storage.local.set({ mockrEditorScheme: editorScheme.value });
});

function getEditorUrl(filePath: string): string {
  switch (editorScheme.value) {
    case 'cursor': return `cursor://file${filePath}`;
    case 'webstorm': return `webstorm://open?file=${filePath}`;
    case 'nvim': return `nvim://${filePath}`;
    default: return `vscode://file${filePath}`;
  }
}

async function loadMockedEndpoints() {
  try {
    const endpoints = await api.listEndpoints();
    renderMockedEndpoints(endpoints);
  } catch (err) {
    mockedBody.innerHTML = `<tr><td colspan="6">Error: ${(err as Error).message}</td></tr>`;
  }
}

function renderMockedEndpoints(eps: Array<{ url: string; method: string; type: string; enabled: boolean; filePath?: string | null }>) {
  mockedBody.innerHTML = '';
  for (const ep of eps) {
    const tr = document.createElement('tr');
    const methodClass = `method-${ep.method.toLowerCase()}`;

    tr.innerHTML = `
      <td class="col-check"><input type="checkbox" ${ep.enabled ? 'checked' : ''} /></td>
      <td class="${methodClass}">${ep.method}</td>
      <td class="editable-url">
        <input type="text" class="url-input" value="${escapeHtml(ep.url)}" />
      </td>
      <td>
        <select class="type-select">
          <option value="static" ${ep.type === 'static' ? 'selected' : ''}>static</option>
          <option value="handler" ${ep.type === 'handler' ? 'selected' : ''}>handler</option>
          <option value="data" ${ep.type === 'data' ? 'selected' : ''}>data</option>
        </select>
      </td>
      <td class="actions-cell">
        <button class="btn btn-save-url" style="display:none;">Save</button>
        ${ep.filePath ? `<a class="btn btn-open" href="${getEditorUrl(ep.filePath)}" title="${escapeHtml(ep.filePath)}">Open</a>` : ''}
      </td>
      <td><button class="btn btn-delete btn-delete-ep">x</button></td>
    `;

    const toggle = tr.querySelector('input[type="checkbox"]') as HTMLInputElement;
    toggle.addEventListener('change', async () => {
      await api.toggleEndpoint(ep.url, toggle.checked, ep.method);
      ep.enabled = toggle.checked;
    });

    const typeSelect = tr.querySelector('.type-select') as HTMLSelectElement;
    typeSelect.addEventListener('change', async () => {
      try {
        await api.updateEndpointType(ep.url, typeSelect.value, ep.method);
        ep.type = typeSelect.value;
        statusEl.textContent = `${ep.url} → ${typeSelect.value}`;
      } catch (err) {
        statusEl.textContent = `Error: ${(err as Error).message}`;
        typeSelect.value = ep.type;
      }
    });

    const urlInput = tr.querySelector('.url-input') as HTMLInputElement;
    const saveBtn = tr.querySelector('.btn-save-url') as HTMLButtonElement;
    const originalUrl = ep.url;

    urlInput.addEventListener('input', () => {
      saveBtn.style.display = urlInput.value !== originalUrl ? '' : 'none';
    });

    saveBtn.addEventListener('click', async () => {
      const newUrl = urlInput.value.trim();
      if (!newUrl || newUrl === originalUrl) return;
      try {
        await api.updateEndpointUrl(originalUrl, newUrl, ep.method);
        ep.url = newUrl;
        saveBtn.style.display = 'none';
        statusEl.textContent = `Updated: ${originalUrl} → ${newUrl}`;
      } catch (err) {
        statusEl.textContent = `Error: ${(err as Error).message}`;
      }
    });

    urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn.click(); });

    const deleteBtn = tr.querySelector('.btn-delete-ep') as HTMLButtonElement;
    deleteBtn.addEventListener('click', async () => {
      try {
        await api.deleteEndpoint(ep.url, ep.method);
        tr.remove();
        statusEl.textContent = `Deleted: ${ep.url}`;
      } catch (err) {
        statusEl.textContent = `Error: ${(err as Error).message}`;
      }
    });

    mockedBody.appendChild(tr);
  }
}

// --- State persistence ---

interface PanelState {
  entries: MemoryEntry[];
  selectedIds: string[];
  filterText: string;
  methodFilter: string;
  isRecording: boolean;
  entryCounter: number;
  preserveLogs: boolean;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function saveState() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const state: PanelState = {
      entries,
      selectedIds: [...selectedEntries],
      filterText,
      methodFilter: activeMethodFilter,
      isRecording,
      entryCounter,
      preserveLogs: preserveLogsCheckbox.checked,
    };
    chrome.storage.local.set({ mockrPanelState: state });
  }, 300);
}


async function restoreState() {
  return new Promise<void>((resolve) => {
    chrome.storage.local.get('mockrPanelState', (result: Record<string, PanelState>) => {
      const state = result.mockrPanelState;
      if (state) {
        entries = state.entries || [];
        totalSize = entries.reduce((s, e) => s + e.size, 0);
        selectedEntries.clear();
        for (const id of state.selectedIds || []) selectedEntries.add(id);
        filterText = state.filterText || '';
        filterInput.value = filterText;
        activeMethodFilter = state.methodFilter || 'all';
        document.querySelectorAll('.method-filter').forEach(b => {
          b.classList.toggle('active', (b as HTMLElement).dataset.method === activeMethodFilter);
        });
        isRecording = state.isRecording ?? true;
        entryCounter = state.entryCounter || entries.length;
        preserveLogsCheckbox.checked = state.preserveLogs ?? false;
      }
      resolve();
    });
  });
}

// Restore then start
restoreState().then(() => {
  renderEntries();
  updateUI();
  if (isRecording) startNetworkListener();
});
