// shared/api.ts
var MockrApi = class {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
  }
  setServerUrl(url) {
    this.serverUrl = url;
  }
  async request(path, options) {
    const res = await fetch(`${this.serverUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers }
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }
  async startRecording(name, baseUrl) {
    return this.request("/__mockr/record/start", {
      method: "POST",
      body: JSON.stringify({ name, baseUrl })
    });
  }
  async recordEntry(sessionId, entry) {
    return this.request("/__mockr/record", {
      method: "POST",
      body: JSON.stringify({ sessionId, ...entry })
    });
  }
  async stopRecording(sessionId) {
    return this.request("/__mockr/record/stop", {
      method: "POST",
      body: JSON.stringify({ sessionId })
    });
  }
  async listSessions() {
    return this.request("/__mockr/sessions");
  }
  async getSession(sessionId) {
    return this.request(`/__mockr/sessions/${sessionId}`);
  }
  async deleteSession(sessionId) {
    await this.request(`/__mockr/sessions/${sessionId}`, { method: "DELETE" });
  }
  async mapToMockr(sessionId, entryIds, options) {
    return this.request("/__mockr/map", {
      method: "POST",
      body: JSON.stringify({ sessionId, entryIds, generateTypes: options?.generateTypes })
    });
  }
  async mapEntries(entries2) {
    return this.request("/__mockr/map", {
      method: "POST",
      body: JSON.stringify({ entries: entries2 })
    });
  }
  async getMappedEndpoints() {
    return this.request("/__mockr/map/endpoints");
  }
  async listEndpoints() {
    return this.request("/__mockr/endpoints");
  }
  async updateEndpointUrl(oldUrl, newUrl, method) {
    await this.request("/__mockr/endpoints", {
      method: "PATCH",
      body: JSON.stringify({ oldUrl, newUrl, method })
    });
  }
  async updateEndpointType(url, type, method) {
    await this.request("/__mockr/endpoints/type", {
      method: "PATCH",
      body: JSON.stringify({ url, type, method })
    });
  }
  async deleteEndpoint(url, method) {
    await this.request("/__mockr/endpoints", {
      method: "DELETE",
      body: JSON.stringify({ url, method })
    });
  }
  async toggleEndpoint(url, enabled, method) {
    await this.request("/__mockr/endpoints/toggle", {
      method: "POST",
      body: JSON.stringify({ url, enabled, method })
    });
  }
};

// devtools/panel.ts
var api;
var isRecording = true;
var entries = [];
var totalSize = 0;
var sortKey = "timestamp";
var sortAsc = true;
var filterText = "";
var activeMethodFilter = "all";
var selectedEntries = /* @__PURE__ */ new Set();
var entryCounter = 0;
var expandedEntryId = null;
var serverUrlInput = document.getElementById("server-url");
var btnRecord = document.getElementById("btn-record");
var btnStop = document.getElementById("btn-stop");
var btnMap = document.getElementById("btn-map");
var btnClear = document.getElementById("btn-clear");
var preserveLogsCheckbox = document.getElementById("preserve-logs");
var statusEl = document.getElementById("status");
var totalSizeEl = document.getElementById("total-size");
var entriesBody = document.getElementById("entries-body");
var filterInput = document.getElementById("filter-input");
var sessionsBody = document.getElementById("sessions-body");
var btnRefreshSessions = document.getElementById("btn-refresh-sessions");
var checkAll = document.getElementById("check-all");
var entryDetail = document.getElementById("entry-detail");
var detailTitle = document.getElementById("detail-title");
var detailBody = document.getElementById("detail-body");
var detailClose = document.getElementById("detail-close");
api = new MockrApi(serverUrlInput.value);
serverUrlInput.addEventListener("change", () => {
  api.setServerUrl(serverUrlInput.value);
  chrome.storage.local.set({ mockrServerUrl: serverUrlInput.value });
});
chrome.storage.local.get("mockrServerUrl", (result) => {
  if (result.mockrServerUrl) {
    serverUrlInput.value = result.mockrServerUrl;
    api.setServerUrl(result.mockrServerUrl);
  }
});
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((tc) => tc.classList.remove("active"));
    tab.classList.add("active");
    const tabName = tab.dataset.tab;
    document.getElementById(`tab-${tabName}`).classList.add("active");
    if (tabName === "sessions") loadSessions();
    if (tabName === "mocked") loadMockedEndpoints();
  });
});
btnRecord.addEventListener("click", () => {
  isRecording = true;
  entries = [];
  totalSize = 0;
  selectedEntries.clear();
  closeDetail();
  startNetworkListener();
  updateUI();
});
btnStop.addEventListener("click", () => {
  isRecording = false;
  stopNetworkListener();
  updateUI();
  statusEl.textContent = `${entries.length} entries captured`;
});
btnClear.addEventListener("click", () => {
  entries = [];
  totalSize = 0;
  selectedEntries.clear();
  closeDetail();
  renderEntries();
  updateUI();
});
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
btnMap.addEventListener("click", async () => {
  if (selectedEntries.size === 0) return;
  try {
    btnMap.disabled = true;
    btnMap.textContent = "Mapping...";
    const selected = entries.filter((e) => selectedEntries.has(e.id));
    const result = await api.mapEntries(selected.map((e) => ({
      url: e.url,
      method: e.method,
      status: e.status,
      contentType: e.contentType,
      body: e.body
    })));
    statusEl.textContent = `Mapped ${result.mapped.length} endpoints`;
    btnMap.textContent = "Map to mockr";
    selectedEntries.clear();
    renderEntries();
    updateUI();
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((tc) => tc.classList.remove("active"));
    document.querySelector('[data-tab="mocked"]').classList.add("active");
    document.getElementById("tab-mocked").classList.add("active");
    loadMockedEndpoints();
  } catch (err) {
    statusEl.textContent = `Map error: ${err.message}`;
    btnMap.textContent = "Map to mockr";
    btnMap.disabled = false;
  }
});
checkAll.addEventListener("change", () => {
  const filtered = getFilteredEntries();
  if (checkAll.checked) {
    for (const e of filtered) selectedEntries.add(e.id);
  } else {
    for (const e of filtered) selectedEntries.delete(e.id);
  }
  renderEntries();
  updateUI();
});
filterInput.addEventListener("input", () => {
  filterText = filterInput.value.toLowerCase();
  renderEntries();
});
document.querySelectorAll("th.sortable").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (sortKey === key) sortAsc = !sortAsc;
    else {
      sortKey = key;
      sortAsc = true;
    }
    renderEntries();
  });
});
document.querySelectorAll(".method-filter").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".method-filter").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeMethodFilter = btn.dataset.method;
    renderEntries();
  });
});
detailClose.addEventListener("click", closeDetail);
function closeDetail() {
  entryDetail.style.display = "none";
  expandedEntryId = null;
}
function showDetail(entry) {
  expandedEntryId = entry.id;
  detailTitle.textContent = `${entry.method} ${truncateUrl(entry.url)} \u2014 ${entry.status}`;
  try {
    detailBody.textContent = JSON.stringify(JSON.parse(entry.body), null, 2);
  } catch {
    detailBody.textContent = entry.body;
  }
  entryDetail.style.display = "flex";
}
btnRefreshSessions.addEventListener("click", loadSessions);
async function loadSessions() {
  try {
    const sessions = await api.listSessions();
    renderSessions(sessions);
  } catch (err) {
    sessionsBody.innerHTML = `<tr><td colspan="4">Error: ${err.message}</td></tr>`;
  }
}
function renderSessions(sessions) {
  sessionsBody.innerHTML = "";
  for (const s of sessions) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(s.name)}</td>
      <td>${s.entryCount}</td>
      <td>${new Date(s.startedAt).toLocaleString()}</td>
      <td class="sessions-actions">
        <button class="btn btn-delete" data-session-id="${s.id}">Delete</button>
      </td>
    `;
    const deleteBtn = tr.querySelector(".btn-delete");
    deleteBtn.addEventListener("click", async () => {
      await api.deleteSession(s.id);
      loadSessions();
    });
    sessionsBody.appendChild(tr);
  }
}
var networkListener = null;
function isXhr(mimeType, url) {
  const ct = mimeType.toLowerCase();
  const u = url.toLowerCase();
  if (ct.includes("image") || u.endsWith(".svg")) return false;
  return ct.includes("json") || ct.includes("xml") || ct.includes("text/plain") || u.includes("/api/");
}
function startNetworkListener() {
  if (networkListener) return;
  networkListener = (request) => {
    if (!isRecording) return;
    const url = request.request.url;
    const method = request.request.method;
    const status = request.response.status;
    const contentType = request.response.content.mimeType || "application/octet-stream";
    const timing = request.time || 0;
    if (!isXhr(contentType, url)) return;
    const responseHeaders = {};
    for (const h of request.response.headers) responseHeaders[h.name.toLowerCase()] = h.value;
    request.getContent((content, _encoding) => {
      if (!isRecording) return;
      const body = content || "";
      const entry = {
        id: `mem-${++entryCounter}`,
        url,
        method,
        status,
        contentType,
        responseHeaders,
        body,
        size: body.length,
        timing,
        timestamp: Date.now()
      };
      entries.push(entry);
      totalSize += entry.size;
      renderEntries();
      updateTotalSize();
    });
  };
  chrome.devtools.network.onRequestFinished.addListener(networkListener);
}
function stopNetworkListener() {
  if (networkListener) {
    chrome.devtools.network.onRequestFinished.removeListener(networkListener);
    networkListener = null;
  }
}
function getFilteredEntries() {
  let filtered = entries;
  if (activeMethodFilter !== "all") {
    filtered = filtered.filter((e) => e.method === activeMethodFilter);
  }
  if (filterText) {
    filtered = filtered.filter((e) => e.url.toLowerCase().includes(filterText));
  }
  return filtered;
}
function updateUI() {
  btnRecord.disabled = isRecording;
  btnRecord.classList.toggle("recording", isRecording);
  btnStop.disabled = !isRecording;
  btnMap.disabled = selectedEntries.size === 0;
  if (isRecording) {
    statusEl.textContent = `Recording... (${entries.length} entries)`;
    statusEl.className = "status recording";
  } else {
    statusEl.textContent = entries.length > 0 ? `${entries.length} entries captured` : "Idle";
    statusEl.className = "status";
  }
  updateTotalSize();
}
function updateTotalSize() {
  if (totalSize === 0) totalSizeEl.textContent = "";
  else if (totalSize < 1024) totalSizeEl.textContent = `${totalSize} B`;
  else if (totalSize < 1024 * 1024) totalSizeEl.textContent = `${(totalSize / 1024).toFixed(1)} KB`;
  else totalSizeEl.textContent = `${(totalSize / (1024 * 1024)).toFixed(1)} MB`;
}
function renderEntries() {
  const filtered = getFilteredEntries();
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    return sortAsc ? av < bv ? -1 : av > bv ? 1 : 0 : av > bv ? -1 : av < bv ? 1 : 0;
  });
  entriesBody.innerHTML = "";
  for (const e of sorted) {
    const tr = document.createElement("tr");
    const methodClass = `method-${e.method.toLowerCase()}`;
    const statusClass = e.status < 300 ? "status-2xx" : e.status < 400 ? "status-3xx" : "status-4xx";
    const sizeStr = e.size < 1024 ? `${e.size} B` : e.size < 1024 * 1024 ? `${(e.size / 1024).toFixed(1)} KB` : `${(e.size / (1024 * 1024)).toFixed(1)} MB`;
    const checked = selectedEntries.has(e.id) ? "checked" : "";
    if (expandedEntryId === e.id) tr.classList.add("entry-selected");
    tr.innerHTML = `
      <td class="col-check"><input type="checkbox" data-entry-id="${e.id}" ${checked} /></td>
      <td class="${methodClass}">${e.method}</td>
      <td class="entry-url" title="${escapeHtml(e.url)}">${escapeHtml(truncateUrl(e.url))}</td>
      <td class="${statusClass}">${e.status}</td>
      <td>${sizeStr}</td>
      <td>${e.timing ? `${Math.round(e.timing)}ms` : "-"}</td>
    `;
    const checkbox = tr.querySelector('input[type="checkbox"]');
    checkbox.addEventListener("change", (ev) => {
      ev.stopPropagation();
      if (checkbox.checked) selectedEntries.add(e.id);
      else selectedEntries.delete(e.id);
      updateUI();
    });
    tr.addEventListener("click", (ev) => {
      if (ev.target.tagName === "INPUT") return;
      if (expandedEntryId === e.id) {
        closeDetail();
        renderEntries();
      } else {
        showDetail(e);
        renderEntries();
      }
    });
    entriesBody.appendChild(tr);
  }
  updateUI();
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function truncateUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}
var mockedBody = document.getElementById("mocked-body");
var btnRefreshMocked = document.getElementById("btn-refresh-mocked");
btnRefreshMocked.addEventListener("click", loadMockedEndpoints);
var editorScheme = document.getElementById("editor-scheme");
chrome.storage.local.get("mockrEditorScheme", (result) => {
  if (result.mockrEditorScheme) editorScheme.value = result.mockrEditorScheme;
});
editorScheme.addEventListener("change", () => {
  chrome.storage.local.set({ mockrEditorScheme: editorScheme.value });
});
function getEditorUrl(filePath) {
  switch (editorScheme.value) {
    case "cursor":
      return `cursor://file${filePath}`;
    case "webstorm":
      return `webstorm://open?file=${filePath}`;
    case "nvim":
      return `nvim://${filePath}`;
    default:
      return `vscode://file${filePath}`;
  }
}
async function loadMockedEndpoints() {
  try {
    const endpoints = await api.listEndpoints();
    renderMockedEndpoints(endpoints);
  } catch (err) {
    mockedBody.innerHTML = `<tr><td colspan="6">Error: ${err.message}</td></tr>`;
  }
}
function renderMockedEndpoints(eps) {
  mockedBody.innerHTML = "";
  for (const ep of eps) {
    const tr = document.createElement("tr");
    const methodClass = `method-${ep.method.toLowerCase()}`;
    tr.innerHTML = `
      <td class="col-check"><input type="checkbox" ${ep.enabled ? "checked" : ""} /></td>
      <td class="${methodClass}">${ep.method}</td>
      <td class="editable-url">
        <input type="text" class="url-input" value="${escapeHtml(ep.url)}" />
      </td>
      <td>
        <select class="type-select">
          <option value="static" ${ep.type === "static" ? "selected" : ""}>static</option>
          <option value="handler" ${ep.type === "handler" ? "selected" : ""}>handler</option>
          <option value="data" ${ep.type === "data" ? "selected" : ""}>data</option>
        </select>
      </td>
      <td class="actions-cell">
        <button class="btn btn-save-url" style="display:none;">Save</button>
        ${ep.filePath ? `<a class="btn btn-open" href="${getEditorUrl(ep.filePath)}" title="${escapeHtml(ep.filePath)}">Open</a>` : ""}
      </td>
      <td><button class="btn btn-delete btn-delete-ep">x</button></td>
    `;
    const toggle = tr.querySelector('input[type="checkbox"]');
    toggle.addEventListener("change", async () => {
      await api.toggleEndpoint(ep.url, toggle.checked, ep.method);
      ep.enabled = toggle.checked;
    });
    const typeSelect = tr.querySelector(".type-select");
    typeSelect.addEventListener("change", async () => {
      try {
        await api.updateEndpointType(ep.url, typeSelect.value, ep.method);
        ep.type = typeSelect.value;
        statusEl.textContent = `${ep.url} \u2192 ${typeSelect.value}`;
      } catch (err) {
        statusEl.textContent = `Error: ${err.message}`;
        typeSelect.value = ep.type;
      }
    });
    const urlInput = tr.querySelector(".url-input");
    const saveBtn = tr.querySelector(".btn-save-url");
    const originalUrl = ep.url;
    urlInput.addEventListener("input", () => {
      saveBtn.style.display = urlInput.value !== originalUrl ? "" : "none";
    });
    saveBtn.addEventListener("click", async () => {
      const newUrl = urlInput.value.trim();
      if (!newUrl || newUrl === originalUrl) return;
      try {
        await api.updateEndpointUrl(originalUrl, newUrl, ep.method);
        ep.url = newUrl;
        saveBtn.style.display = "none";
        statusEl.textContent = `Updated: ${originalUrl} \u2192 ${newUrl}`;
      } catch (err) {
        statusEl.textContent = `Error: ${err.message}`;
      }
    });
    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveBtn.click();
    });
    const deleteBtn = tr.querySelector(".btn-delete-ep");
    deleteBtn.addEventListener("click", async () => {
      try {
        await api.deleteEndpoint(ep.url, ep.method);
        tr.remove();
        statusEl.textContent = `Deleted: ${ep.url}`;
      } catch (err) {
        statusEl.textContent = `Error: ${err.message}`;
      }
    });
    mockedBody.appendChild(tr);
  }
}
startNetworkListener();
updateUI();
//# sourceMappingURL=panel.js.map
