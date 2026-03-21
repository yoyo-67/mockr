// Content script: relays captured entries from the page's intercept.ts to the service worker

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.type !== '__mockr_captured__') return;
  chrome.runtime.sendMessage({ type: 'entry-captured', entry: event.data.entry });
});
