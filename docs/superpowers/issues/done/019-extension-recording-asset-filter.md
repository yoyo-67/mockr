# 019 — Extension: configurable recording filter (assets vs JS vs JSON)

**Track:** Extension
**Type:** AFK

## What to build

`useRecorder.isXhr` (`chrome-extension/devtools/hooks/useRecorder.ts:4`) hardcodes a keyword filter: capture if content-type contains `json|xml|text/plain`, or URL contains `/api/`. Skip images. JS/CSS/fonts/HTML never even reach the heuristic — they flow through `chrome.devtools.network.onRequestFinished` and get rejected only by the missing keyword.

Two pain points:
1. **GraphQL / RPC apps capture nothing** because their endpoint isn't under `/api/` (e.g., `/graphql`, `/v1/rpc`) and content-type happens to be plain.
2. **Heavy assets sometimes ARE the thing you want to mock** (images, JSON blobs) but capturing all of them blows up the entries table; capturing none of them blocks legitimate cases.

Junior should pick what to capture without editing source.

## Acceptance criteria

- [ ] Toolbar (or Header) gains a small filter group with toggleable types. Default set: **JSON** on, **XML** on, **Text** on, **Images** off, **JS** off, **CSS** off, **Fonts** off, **Other** off.
- [ ] Setting persisted to `chrome.storage.local.mockrRecordingFilter` so toggles survive panel reload.
- [ ] `useRecorder` no longer hardcodes `isXhr`. It receives the active type set and matches content-type / file extension against it.
- [ ] Filter helpers (mapping content-type → category) live in a small pure function, unit-testable. Add a runtime test covering each category (`image/png`, `application/json`, `text/javascript`, `application/octet-stream` → `Other`, etc.).
- [ ] When all categories are off, the toolbar shows a small inline warning "No types enabled — recording captures nothing".
- [ ] Filter is applied at capture time, not at display time. Filtered-out requests never enter the entries store (so the size counter stays small even on asset-heavy pages).
- [ ] Existing URL-substring filter (the text input in EntriesTable) is unrelated and stays.

## Blocked by

Nothing.

## Notes

- Out of scope: per-host filter, regex filter, content-type allowlist beyond the default categories. If the default categories miss real cases, expand the list rather than introducing free-form regex.
- The `/api/` URL-substring rule is removed. With JSON-on by default, GraphQL endpoints are captured because their content-type is `application/json` regardless of path. RPC endpoints with `text/plain` work too (Text on by default).
- Consider a small "preset" button later: "Mock data" preset (JSON+XML+Text), "Everything" preset (all on), "Off" preset. Defer until users ask.
