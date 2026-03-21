// Injected into pages to intercept fetch/XHR and capture responses
// Sends captured entries to the service worker via window.postMessage → content script → runtime.sendMessage

const MOCKR_MSG = '__mockr_captured__';

function isXhrUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes('/api/') || u.includes('.json');
}

function isXhrContentType(ct: string): boolean {
  return ct.includes('json') || ct.includes('xml') || ct.includes('text/plain');
}

// --- Intercept fetch ---
const originalFetch = window.fetch;
window.fetch = async function(...args: Parameters<typeof fetch>) {
  const start = performance.now();
  const req = new Request(...args);
  const url = req.url;
  const method = req.method;

  try {
    const response = await originalFetch.apply(this, args);
    const timing = performance.now() - start;
    const contentType = response.headers.get('content-type') || '';

    if (isXhrUrl(url) || isXhrContentType(contentType)) {
      // Clone so the app can still read the response
      const clone = response.clone();
      clone.text().then(body => {
        window.postMessage({
          type: MOCKR_MSG,
          entry: {
            url, method,
            status: response.status,
            contentType,
            body,
            timing: Math.round(timing),
          },
        }, '*');
      }).catch(() => {});
    }

    return response;
  } catch (err) {
    throw err;
  }
};

// --- Intercept XMLHttpRequest ---
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...rest: any[]) {
  (this as any).__mockr_method = method;
  (this as any).__mockr_url = typeof url === 'string' ? url : url.toString();
  (this as any).__mockr_start = performance.now();
  return originalOpen.apply(this, [method, url, ...rest] as any);
};

XMLHttpRequest.prototype.send = function(...args: any[]) {
  this.addEventListener('load', function() {
    const url = (this as any).__mockr_url || '';
    const method = (this as any).__mockr_method || 'GET';
    const timing = performance.now() - ((this as any).__mockr_start || 0);
    const contentType = this.getResponseHeader('content-type') || '';

    if (isXhrUrl(url) || isXhrContentType(contentType)) {
      window.postMessage({
        type: MOCKR_MSG,
        entry: {
          url, method,
          status: this.status,
          contentType,
          body: this.responseText,
          timing: Math.round(timing),
        },
      }, '*');
    }
  });
  return originalSend.apply(this, args as any);
};
