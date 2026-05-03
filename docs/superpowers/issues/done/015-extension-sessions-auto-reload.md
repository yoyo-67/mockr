# 015 — Extension: sessions auto-reload inspected page

**Track:** Extension
**Type:** AFK

## What to build

Every Sessions-tab state change reloads the inspected page via `chrome.devtools.inspectedWindow.reload()`. Today, only the sidebar list refreshes — server flips mode but the page never re-issues requests, so record-mode captures nothing and replay-mode appears broken until the user manually F5s.

State changes that trigger reload:
- Activate session in `record` mode
- Activate session in `replay` mode
- Switch active session (different id, either mode)
- Deactivate active session

## Acceptance criteria

- [ ] `chrome-extension/devtools/components/SessionsTab.tsx`: `handleActivate` and `handleDeactivate` both call `chrome.devtools.inspectedWindow.reload()` after the API call resolves.
- [ ] Status toast updated to read "Reloading…" briefly during the reload (existing `setStatus` mechanism is fine).
- [ ] No reload on `Clear` (data wipe, not state change) or `Delete` (unless deleting the active session — then deactivate-and-reload semantics apply via server clearing `active` and the next list-fetch showing nothing active).
- [ ] No confirm dialog. Junior expects instant cause-effect.
- [ ] Manually verified: record-mode captures requests after activation without manual page reload; replay-mode serves cached responses immediately after activation.

## Blocked by

Nothing.

## Notes

- Server session state lives in a process-local closure (`src/memory-session.ts:73`), so a browser reload does not lose `active` — page re-issues requests, server keeps recording into the same active session.
- Only GET/HEAD enter sessions (`CACHEABLE_METHODS`). Surfacing this to the user is a separate UX issue (not in scope here).
- Future: add an opt-out checkbox ("Auto-reload page", default on) in chrome.storage if users complain about lost form state. Defer.
