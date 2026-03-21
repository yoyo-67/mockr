import { MockrApi } from '../shared/api.js';
import type { SessionInfo } from '../shared/types.js';

// In-memory recorded entry (includes body, never sent to server until map)
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
let isRecording = true; // auto-start
let entries: MemoryEntry[] = [];
let totalSize = 0;
let sortKey = 'timestamp';
let sortAsc = true;
let filterText = '';
let activeTypeFilter = 'xhr';
const selectedEntries = new Set<string>();
let entryCounter = 0;

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
    if (tabName === 'mocked') loadMockedEndpoints();
  });
});

// Record / Stop — toggle in-memory recording
btnRecord.addEventListener('click', () => {
  isRecording = true;
  entries = [];
  totalSize = 0;
  selectedEntries.clear();
  startNetworkListener();
  updateUI();
});

btnStop.addEventListener('click', () => {
  isRecording = false;
  stopNetworkListener();
  updateUI();
  statusEl.textContent = `${entries.length} entries captured`;
});

// Map to mockr — send selected entries with bodies directly to server
btnMap.addEventListener('click', async () => {
  if (selectedEntries.size === 0) return;
  try {
    btnMap.disabled = true;
    btnMap.textContent = 'Mapping...';

    const selected = entries.filter(e => selectedEntries.has(e.id));
    const result = await api.mapEntries(selected.map(e => ({
      url: e.url,
      method: e.method,
      status: e.status,
      contentType: e.contentType,
      body: e.body,
    })));

    statusEl.textContent = `Mapped ${result.mapped.length} endpoints`;
    btnMap.textContent = 'Map to mockr';
    updateUI();

    // Switch to Mocked tab to show the new endpoints
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

// Select All visible (filtered) entries
btnSelectAllApi.addEventListener('click', () => {
  const filtered = getFilteredEntries();
  selectedEntries.clear();
  for (const e of filtered) selectedEntries.add(e.id);
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

// Type filters
document.querySelectorAll('.type-filter').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.type-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTypeFilter = (btn as HTMLElement).dataset.type!;
    renderEntries();
  });
});

// Sessions (server-stored sessions, kept for browsing old recordings)
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
  if (networkListener) return; // already listening

  networkListener = (request: chrome.devtools.network.Request) => {
    if (!isRecording) return;

    const url = request.request.url;
    const method = request.request.method;
    const status = request.response.status;
    const contentType = request.response.content.mimeType || 'application/octet-stream';
    const timing = request.time || 0;

    // Only capture XHR-like requests
    if (!isXhr(contentType, url)) return;

    const responseHeaders: Record<string, string> = {};
    for (const h of request.response.headers) {
      responseHeaders[h.name.toLowerCase()] = h.value;
    }

    request.getContent((content: string, _encoding: string) => {
      if (!isRecording) return;

      const body = content || '';
      const id = `mem-${++entryCounter}`;
      const entry: MemoryEntry = {
        id,
        url,
        method,
        status,
        contentType,
        responseHeaders,
        body,
        size: body.length,
        timing,
        timestamp: Date.now(),
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
function matchesTypeFilter(e: MemoryEntry): boolean {
  if (activeTypeFilter === 'all') return true;
  const ct = e.contentType.toLowerCase();
  const url = e.url.toLowerCase();
  switch (activeTypeFilter) {
    case 'xhr': return isXhr(ct, url);
    case 'js': return ct.includes('javascript') || url.endsWith('.js');
    case 'css': return ct.includes('css') || url.endsWith('.css');
    case 'img': return ct.includes('image') || /\.(png|jpg|jpeg|gif|svg|webp|ico)(\?|$)/i.test(url);
    case 'font': return ct.includes('font') || /\.(woff|woff2|ttf|otf|eot)(\?|$)/i.test(url);
    case 'doc': return ct.includes('html');
    case 'other': {
      const types = ['xhr', 'js', 'css', 'img', 'font', 'doc'];
      return !types.some(t => {
        const prev = activeTypeFilter;
        activeTypeFilter = t;
        const m = matchesTypeFilter(e);
        activeTypeFilter = prev;
        return m;
      });
    }
    default: return true;
  }
}

function getFilteredEntries(): MemoryEntry[] {
  let filtered = entries.filter(matchesTypeFilter);
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
      if (checkbox.checked) selectedEntries.add(e.id);
      else selectedEntries.delete(e.id);
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

// Mocked endpoints tab
const mockedBody = document.getElementById('mocked-body') as HTMLTableSectionElement;
const btnRefreshMocked = document.getElementById('btn-refresh-mocked') as HTMLButtonElement;

btnRefreshMocked.addEventListener('click', loadMockedEndpoints);

async function loadMockedEndpoints() {
  try {
    const endpoints = await api.listEndpoints();
    renderMockedEndpoints(endpoints);
  } catch (err) {
    mockedBody.innerHTML = `<tr><td colspan="5">Error: ${(err as Error).message}</td></tr>`;
  }
}

function renderMockedEndpoints(eps: Array<{ url: string; method: string; type: string; enabled: boolean; bodyFile?: string }>) {
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
        ${ep.bodyFile ? `<span class="body-file" title="${escapeHtml(ep.bodyFile)}">${ep.bodyFile.split('/').pop()}</span>` : ''}
      </td>
      <td><button class="btn btn-delete btn-delete-ep">x</button></td>
    `;

    // Toggle enabled/disabled
    const toggle = tr.querySelector('input[type="checkbox"]') as HTMLInputElement;
    toggle.addEventListener('change', async () => {
      await api.toggleEndpoint(ep.url, toggle.checked, ep.method);
      ep.enabled = toggle.checked;
    });

    // Type select
    const typeSelect = tr.querySelector('.type-select') as HTMLSelectElement;
    typeSelect.addEventListener('change', async () => {
      try {
        await api.updateEndpointType(ep.url, typeSelect.value, ep.method);
        ep.type = typeSelect.value;
        statusEl.textContent = `${ep.url} → ${typeSelect.value}`;
      } catch (err) {
        statusEl.textContent = `Error: ${(err as Error).message}`;
        typeSelect.value = ep.type; // revert
      }
    });

    // Edit URL
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

    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveBtn.click();
    });

    // Delete endpoint
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

// Auto-start recording on panel load
startNetworkListener();
updateUI();
