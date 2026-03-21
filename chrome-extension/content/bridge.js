"use strict";
(() => {
  // content/bridge.ts
  var script = document.createElement("script");
  script.src = chrome.runtime.getURL("content/intercept.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "__mockr_captured__") return;
    chrome.runtime.sendMessage({ type: "entry-captured", entry: event.data.entry }).catch(() => {
    });
  });
})();
//# sourceMappingURL=bridge.js.map
