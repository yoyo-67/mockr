# 020 — Extension: remove dead content-script + service-worker recording path

**Track:** Extension
**Type:** AFK

## What to build

The extension has two parallel recording paths. Only one is live:

- **Live**: `useRecorder.ts` listens on `chrome.devtools.network.onRequestFinished` from the devtools panel.
- **Dead**: `content/intercept.ts` overrides `window.fetch` + XHR, `content/bridge.ts` relays via `window.postMessage`, `background/service-worker.ts` writes captured entries directly to `mockrPanelState` in `chrome.storage.local`.

The dead path:
- Races the React store on `mockrPanelState` (writes from two sources, no coordination).
- Inflates the install warning: `<all_urls>` host permission, `tabs` permission, content_scripts entry.
- Pulls in code (~140 LOC across 3 files) that no UI references.

`chrome.runtime.sendMessage` is not called from anywhere in the extension's TS/TSX (verified via grep). Editor links use direct `<a href="vscode://…">` anchors, not the service-worker open-editor relay.

## Acceptance criteria

- [ ] Delete `chrome-extension/content/` directory (both `.ts` and `.js` outputs).
- [ ] Delete `chrome-extension/background/` directory (both `.ts` and `.js` outputs).
- [ ] `chrome-extension/manifest.json`:
  - Remove `permissions: "tabs"` (keep `devtools`, `storage`, `unlimitedStorage`).
  - Remove `host_permissions`.
  - Remove `background` block.
  - Remove `content_scripts` block.
  - Remove `web_accessible_resources`.
- [ ] `chrome-extension/build.mjs`: drop the three configs for `service-worker.ts`, `intercept.ts`, `bridge.ts`. Keep `devtools.ts` and `panel.tsx`.
- [ ] Build still succeeds (`npm run build` from `chrome-extension/`).
- [ ] Manual verify: load extension, open devtools panel, hit Record, navigate a page, confirm entries still capture (devtools-API path).

## Blocked by

Nothing.

## Notes

- Reduces install-warning surface: extension no longer requires "<all_urls>" host access.
- If a future feature genuinely needs page-context interception (e.g., capturing request bodies, which `chrome.devtools.network` exposes via `request.request.postData`), reintroduce content scripts then.
