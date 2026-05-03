# 017 — Endpoint groups replace FE folders

**Track:** Extension + Library
**Type:** AFK

## What to build

Delete the FE-only folders concept. Grouping is server-declared via an optional name on `endpoints<T>(name?, items)`. Mocked tab renders one section per group, derived from the server's endpoint list. No drag-drop, no chrome.storage assignment state, no orphan-on-rename.

Public API:

```ts
// before — current v0.3.0
export const authMocks = endpoints<AuthEndpoints>([...]);

// after — name optional, runtime stays a near-no-op
export const authMocks = endpoints<AuthEndpoints>('Auth', [...]);
export const flatMocks = endpoints<MiscEndpoints>([...]); // still legal, ungrouped
```

## Acceptance criteria

### Library

- [ ] `endpoints<T>(name: string, items: ...)` overload added alongside existing `endpoints<T>(items)`. When name provided, runtime mutates each item to attach `__group: name` (non-enumerable or symbol-keyed to keep introspection clean). Items are returned unchanged otherwise.
- [ ] Type tests in `tests/endpoints-helper.test-d.ts`: name overload accepts string + array; existing nameless overload still accepts array directly; mismatched type-arg URLs still rejected.
- [ ] Runtime tests in `tests/endpoints-helper.test.ts`: name attaches to each item; nameless call returns identical reference (existing behavior); empty array case.
- [ ] Server reads `__group` when registering endpoints in `src/server.ts` and stores it on `InternalEndpoint`.

### Server

- [ ] `GET /__mockr/endpoints` response gains `group: string | null` field per endpoint.
- [ ] `addEndpointToServerFile` (server-file-patcher) keeps inserting at top level for now — Map-time group selection is a separate issue (018-extension-map-group-select, if we choose to build it).

### Extension

- [ ] `chrome-extension/shared/api.ts`: `listEndpoints` return type adds `group: string | null`.
- [ ] `chrome-extension/devtools/components/MockedTab.tsx`: render endpoints partitioned by `group`. Group sections render alphabetically by group name (or by first-seen order — pick during impl). Ungrouped endpoints render in a flat list at the bottom.
- [ ] Delete: drag-drop logic, `FolderData` interface, `mockrFolders2` storage read/write, "+ New folder" UI, folder rename/delete handlers. Keep collapse/expand per group (persist `groupCollapsed: Record<string, boolean>` to chrome.storage so the UI remembers).
- [ ] Migration: on first load after upgrade, extension calls `chrome.storage.local.remove(['mockrFolders2'])` to clean up. (No data preserved — assignments don't translate to server-derived groups.)
- [ ] `chrome-extension/manifest.json`: bump version, update description if needed.

### Docs

- [ ] README "Splitting mocks across files" section updated to show the named-group form.
- [ ] Playground/example updated: at least one group has a name.

## Blocked by

- 003 (`endpoints<T>()` helper exists — done) — this issue extends it.

## Notes

- Skips a "Map-time group select" UX (the (Q) option from grilling). Map continues to insert at top level; junior cuts/pastes the line into a `endpoints<T>('X', [...])` group manually. If hand-editing proves painful, file a follow-up issue.
- Group ordering inside Mocked tab: open question. Recommend declaration-order from server (preserves config intent). Alphabetical is a fallback if declaration-order is hard to track.
- The `__group` tag is internal — junior never reads it. If a third-party consumes the array, the extra field is a no-op for them.
