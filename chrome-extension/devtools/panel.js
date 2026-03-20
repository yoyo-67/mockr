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
  async recordEntry(sessionId2, entry) {
    return this.request("/__mockr/record", {
      method: "POST",
      body: JSON.stringify({ sessionId: sessionId2, ...entry })
    });
  }
  async stopRecording(sessionId2) {
    return this.request("/__mockr/record/stop", {
      method: "POST",
      body: JSON.stringify({ sessionId: sessionId2 })
    });
  }
  async listSessions() {
    return this.request("/__mockr/sessions");
  }
  async getSession(sessionId2) {
    return this.request(`/__mockr/sessions/${sessionId2}`);
  }
  async deleteSession(sessionId2) {
    await this.request(`/__mockr/sessions/${sessionId2}`, { method: "DELETE" });
  }
  async mapToMockr(sessionId2, entryIds, options) {
    return this.request("/__mockr/map", {
      method: "POST",
      body: JSON.stringify({ sessionId: sessionId2, entryIds, generateTypes: options?.generateTypes })
    });
  }
  async getMappedEndpoints() {
    return this.request("/__mockr/map/endpoints");
  }
};

// devtools/panel.ts
var api;
var sessionId = null;
var isRecording = false;
var entries = [];
var totalSize = 0;
var sortKey = "timestamp";
var sortAsc = true;
var filterText = "";
var selectedEntries = /* @__PURE__ */ new Set();
var serverUrlInput = document.getElementById("server-url");
var btnRecord = document.getElementById("btn-record");
var btnStop = document.getElementById("btn-stop");
var btnMap = document.getElementById("btn-map");
var btnSelectAllApi = document.getElementById("btn-select-all");
var statusEl = document.getElementById("status");
var totalSizeEl = document.getElementById("total-size");
var entriesBody = document.getElementById("entries-body");
var filterInput = document.getElementById("filter-input");
var sessionsBody = document.getElementById("sessions-body");
var btnRefreshSessions = document.getElementById("btn-refresh-sessions");
var checkAll = document.getElementById("check-all");
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
  });
});
btnRecord.addEventListener("click", async () => {
  if (isRecording) return;
  try {
    const name = `recording-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[T:]/g, "-")}`;
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
    statusEl.textContent = `Error: ${err.message}`;
  }
});
btnStop.addEventListener("click", async () => {
  if (!isRecording || !sessionId) return;
  try {
    stopNetworkListener();
    await api.stopRecording(sessionId);
    isRecording = false;
    updateUI();
    statusEl.textContent = `Saved ${entries.length} entries`;
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
});
btnMap.addEventListener("click", async () => {
  if (selectedEntries.size === 0 || !sessionId) return;
  try {
    btnMap.disabled = true;
    btnMap.textContent = "Mapping...";
    const entryIds = [...selectedEntries];
    const result = await api.mapToMockr(sessionId, entryIds);
    statusEl.textContent = `Mapped ${result.mapped.length} endpoints`;
    btnMap.textContent = "Map to mockr";
    updateUI();
  } catch (err) {
    statusEl.textContent = `Map error: ${err.message}`;
    btnMap.textContent = "Map to mockr";
    btnMap.disabled = false;
  }
});
btnSelectAllApi.addEventListener("click", () => {
  const apiEntries = entries.filter(
    (e) => e.url.includes("/api/") && e.method === "GET" && e.status >= 200 && e.status < 400
  );
  selectedEntries.clear();
  for (const e of apiEntries) selectedEntries.add(e.id);
  renderEntries();
  updateUI();
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
    if (sortKey === key) {
      sortAsc = !sortAsc;
    } else {
      sortKey = key;
      sortAsc = true;
    }
    renderEntries();
  });
});
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
        <button class="btn btn-map" data-session-id="${s.id}">View & Map</button>
        <button class="btn btn-delete" data-session-id="${s.id}">Delete</button>
      </td>
    `;
    const mapBtn = tr.querySelector(".btn-map");
    mapBtn.addEventListener("click", () => loadSessionEntries(s.id));
    const deleteBtn = tr.querySelector(".btn-delete");
    deleteBtn.addEventListener("click", async () => {
      await api.deleteSession(s.id);
      loadSessions();
    });
    sessionsBody.appendChild(tr);
  }
}
async function loadSessionEntries(sid) {
  try {
    const session = await api.getSession(sid);
    sessionId = sid;
    entries = session.entries;
    totalSize = entries.reduce((sum, e) => sum + e.size, 0);
    selectedEntries.clear();
    isRecording = false;
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((tc) => tc.classList.remove("active"));
    document.querySelector('[data-tab="recording"]').classList.add("active");
    document.getElementById("tab-recording").classList.add("active");
    renderEntries();
    updateUI();
    statusEl.textContent = `Loaded session: ${session.name} (${entries.length} entries)`;
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
}
var networkListener = null;
function startNetworkListener() {
  networkListener = (request) => {
    if (!isRecording || !sessionId) return;
    const entry = request;
    const url = entry.request.url;
    const method = entry.request.method;
    const status = entry.response.status;
    const contentType = entry.response.content.mimeType || "application/octet-stream";
    const timing = entry.time || 0;
    const responseHeaders = {};
    for (const h of entry.response.headers) {
      responseHeaders[h.name.toLowerCase()] = h.value;
    }
    entry.getContent((content, _encoding) => {
      if (!isRecording || !sessionId) return;
      const body = content || "";
      const sid = sessionId;
      api.recordEntry(sid, {
        url,
        method,
        status,
        contentType,
        responseHeaders,
        body,
        timing
      }).then((recorded) => {
        entries.push(recorded);
        totalSize += recorded.size;
        renderEntries();
        updateTotalSize();
      }).catch((err) => {
        console.error("[mockr] Failed to record entry:", err);
      });
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
  return filterText ? entries.filter((e) => e.url.toLowerCase().includes(filterText)) : entries;
}
function updateUI() {
  btnRecord.disabled = isRecording;
  btnRecord.classList.toggle("recording", isRecording);
  btnStop.disabled = !isRecording;
  btnMap.disabled = selectedEntries.size === 0 || !sessionId;
  if (isRecording) {
    statusEl.textContent = `Recording... (${entries.length} entries)`;
    statusEl.className = "status recording";
  } else if (statusEl.className !== "status") {
  } else {
    statusEl.textContent = entries.length > 0 ? `${entries.length} entries` : "Idle";
  }
  updateTotalSize();
}
function updateTotalSize() {
  if (totalSize === 0) {
    totalSizeEl.textContent = "";
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
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortAsc ? cmp : -cmp;
  });
  entriesBody.innerHTML = "";
  for (const e of sorted) {
    const tr = document.createElement("tr");
    const methodClass = `method-${e.method.toLowerCase()}`;
    const statusClass = e.status < 300 ? "status-2xx" : e.status < 400 ? "status-3xx" : "status-4xx";
    const sizeStr = e.size < 1024 ? `${e.size} B` : e.size < 1024 * 1024 ? `${(e.size / 1024).toFixed(1)} KB` : `${(e.size / (1024 * 1024)).toFixed(1)} MB`;
    const checked = selectedEntries.has(e.id) ? "checked" : "";
    tr.innerHTML = `
      <td class="col-check"><input type="checkbox" data-entry-id="${e.id}" ${checked} /></td>
      <td class="${methodClass}">${e.method}</td>
      <td title="${escapeHtml(e.url)}">${escapeHtml(truncateUrl(e.url))}</td>
      <td class="${statusClass}">${e.status}</td>
      <td>${sizeStr}</td>
      <td>${e.timing ? `${Math.round(e.timing)}ms` : "-"}</td>
    `;
    const checkbox = tr.querySelector('input[type="checkbox"]');
    checkbox.addEventListener("change", () => {
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
function getPageUrl() {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval("location.origin", (result) => {
      resolve(result || "");
    });
  });
}
//# sourceMappingURL=panel.js.map
