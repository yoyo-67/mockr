// Content script: injects the intercept script into the page and relays messages to the service worker

// Inject intercept.js into the page's main world (so it can override fetch/XHR)
const script = document.createElement('script');
script.src = chrome.runtime.getURL('content/intercept.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

// Relay captured entries from page → service worker
window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.type !== '__mockr_captured__') return;
  chrome.runtime.sendMessage({ type: 'entry-captured', entry: event.data.entry }).catch(() => {});
});
