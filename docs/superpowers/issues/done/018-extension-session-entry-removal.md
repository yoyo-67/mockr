# 018 — Extension: remove individual entries from a session

**Track:** Extension + Library
**Type:** AFK

## What to build

Sessions tab today supports `Clear` (wipe all entries) and `Delete` (drop the whole session). No way to remove a single bad entry without nuking the rest. Junior records 50 requests, one is wrong (stale auth, error response), wants to drop just that one.

Add per-entry delete in the expanded session view.

## Acceptance criteria

### Server

- [ ] `DELETE /__mockr/mem-sessions/:id/entries/:key` (URL-encoded key) removes a single entry from the session's `entries` Map. 404 if session or key missing. 200 with `{ deleted: key }` on success.
- [ ] `MemorySessionStore` interface gains `deleteEntry(id: string, key: string): boolean`. Returns `true` if removed, `false` if not found.
- [ ] Tests in `tests/memory-session.test.ts` for `deleteEntry` (existing key, missing key, missing session).

### Extension

- [ ] `chrome-extension/shared/api.ts`: `deleteMemSessionEntry(id: string, key: string): Promise<void>`.
- [ ] `SessionsTab.tsx`: each row in the expanded entries list gets a small `×` button on hover. Click → call API → refresh entries via `loadEntries(id)` and refresh session list (entryCount changes).
- [ ] No confirm dialog. Single entry is cheap to lose; if junior misclicks, they re-record.

## Blocked by

Nothing.

## Notes

- Out of scope: bulk-select entries, undo, filter-then-delete-all.
- Cache-key shape is `${METHOD} ${path}${normalizedQuery}` (`src/memory-session.ts:66`). Encode it once on the URL path for the DELETE request; decode server-side.
