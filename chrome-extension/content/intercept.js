"use strict";
(() => {
  // content/intercept.ts
  var MOCKR_MSG = "__mockr_captured__";
  function isXhrUrl(url) {
    const u = url.toLowerCase();
    return u.includes("/api/") || u.includes(".json");
  }
  function isXhrContentType(ct) {
    return ct.includes("json") || ct.includes("xml") || ct.includes("text/plain");
  }
  var originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const start = performance.now();
    const req = new Request(...args);
    const url = req.url;
    const method = req.method;
    try {
      const response = await originalFetch.apply(this, args);
      const timing = performance.now() - start;
      const contentType = response.headers.get("content-type") || "";
      if (isXhrUrl(url) || isXhrContentType(contentType)) {
        const clone = response.clone();
        clone.text().then((body) => {
          window.postMessage({
            type: MOCKR_MSG,
            entry: {
              url,
              method,
              status: response.status,
              contentType,
              body,
              timing: Math.round(timing)
            }
          }, "*");
        }).catch(() => {
        });
      }
      return response;
    } catch (err) {
      throw err;
    }
  };
  var originalOpen = XMLHttpRequest.prototype.open;
  var originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__mockr_method = method;
    this.__mockr_url = typeof url === "string" ? url : url.toString();
    this.__mockr_start = performance.now();
    return originalOpen.apply(this, [method, url, ...rest]);
  };
  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener("load", function() {
      const url = this.__mockr_url || "";
      const method = this.__mockr_method || "GET";
      const timing = performance.now() - (this.__mockr_start || 0);
      const contentType = this.getResponseHeader("content-type") || "";
      if (isXhrUrl(url) || isXhrContentType(contentType)) {
        window.postMessage({
          type: MOCKR_MSG,
          entry: {
            url,
            method,
            status: this.status,
            contentType,
            body: this.responseText,
            timing: Math.round(timing)
          }
        }, "*");
      }
    });
    return originalSend.apply(this, args);
  };
})();
//# sourceMappingURL=intercept.js.map
