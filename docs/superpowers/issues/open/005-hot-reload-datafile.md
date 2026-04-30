# 005 — Hot-reload `dataFile`

**Type:** AFK
**Spec:** [`docs/superpowers/specs/2026-04-30-mock-writing-api-redesign-design.md`](../../specs/2026-04-30-mock-writing-api-redesign-design.md)
**Plan tasks:** 10, 11

## What to build

When a `dataFile`'s underlying JSON changes on disk, the corresponding endpoint reflects the new content within ~200ms — no server restart. **Reset semantics**: in-memory mutations are dropped; file content is the new truth. Always-on (no opt-in flag).

## Acceptance criteria

- [ ] `src/data-file-watcher.ts` exports `createDataFileWatcher()` returning `{ register(path, onChange), closeAll() }`.
- [ ] Watcher uses `node:fs.watch`, debounces filesystem events with a 100ms timer, parses the file as JSON, calls `onChange(parsed)` on success.
- [ ] Bad JSON during reload: log error, keep last good copy in memory, do not crash, do not call `onChange`.
- [ ] Multiple rapid writes (3 within 50ms) collapse to a single `onChange` call.
- [ ] `closeAll()` stops every watcher and clears any pending debounce timers.
- [ ] Server boot creates one watcher per `dataFile` endpoint. On change, calls `replaceData(arr)` (added to `ListHandle`) for arrays or `replace(obj)` for records.
- [ ] `ListHandle` gets a `replaceData(items: T[]): void` method that swaps the internal array AND updates the baseline so a subsequent `.reset()` goes to the new content.
- [ ] `server.close()` calls `watcher.closeAll()`.
- [ ] Tests: `tests/data-file-watcher.test.ts` (debounce, reset content, bad JSON keep-last-good, closeAll stops events). `tests/data-file-hot-reload.test.ts` (integration: edit file → fetch endpoint reflects new data; in-memory POST mutations are dropped on reload).
- [ ] README: short "Hot reload" section under `dataFile`.

## Blocked by

- 004 (needs `FileRef` to read the path)

## Notes

- 100ms debounce handles editor-save bursts (atomic write + truncate often fires multiple events).
- Reset semantics chosen because junior expects "file changed → that's truth"; merge would hide overlay state and break the mental model.
