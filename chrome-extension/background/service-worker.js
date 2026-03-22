// background/service-worker.ts
var entryCounter = 0;
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "entry-captured") {
    const entry = {
      id: `bg-${++entryCounter}`,
      url: msg.entry.url,
      method: msg.entry.method,
      status: msg.entry.status,
      contentType: msg.entry.contentType,
      body: msg.entry.body,
      size: (msg.entry.body || "").length,
      timing: msg.entry.timing || 0,
      timestamp: Date.now(),
      responseHeaders: {}
    };
    chrome.storage.local.get("mockrPanelState", (result) => {
      const state = result.mockrPanelState || { entries: [], selectedIds: [], isRecording: true, entryCounter: 0 };
      if (!state.isRecording) return;
      state.entries.push(entry);
      state.entryCounter = entryCounter;
      chrome.storage.local.set({ mockrPanelState: state });
    });
    sendResponse({ ok: true });
  }
});
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "open-editor" && msg.url) {
    chrome.tabs.create({ url: msg.url, active: false }, (tab) => {
      if (tab?.id) setTimeout(() => chrome.tabs.remove(tab.id), 300);
    });
  }
});
console.log("[mockr] Service worker loaded \u2014 background recording active");
//# sourceMappingURL=service-worker.js.map
