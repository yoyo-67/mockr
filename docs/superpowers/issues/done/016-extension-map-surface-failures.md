# 016 — Extension: Map flow surfaces failures

**Track:** Extension
**Type:** AFK

## What to build

`Map to mockr` currently fails silently. Three distinct silent-failure modes:

1. **API error swallowed.** `App.tsx:69` logs to `console.error` only. Junior thinks map worked.
2. **Empty body written.** `chrome.devtools.network.getContent` returns `null` for some responses (errors, large bodies, CORS-blocked). Server writes empty file and registers garbage endpoint.
3. **Bad JSON falls through to raw text.** `control-routes.ts:471-472` catches `JSON.parse` failure and writes the original body unchanged. Endpoint exists but content-type lies.

Make each failure loud.

## Acceptance criteria

- [ ] Toast on map error in the extension panel. Use the existing status pattern (or add a small toast region under the toolbar). On success show "Mapped N endpoint(s)". On failure show the server error message, not `[mockr] Map error`.
- [ ] Client-side: filter out entries with empty body before POSTing to `/__mockr/map`. Show a per-row warning in the toast: "3 entries had no captured body and were skipped."
- [ ] Server-side: `handleMap` (`src/control-routes.ts:420`) returns `400` if any entry has an empty body, listing the offending URLs. Aborts before any file write — partial state is worse than no state.
- [ ] Server-side: when `contentType` includes `json`, validate `JSON.parse(body)` succeeds before writing the file. On parse error, return `400` with the URL and parse error message. No fallback to raw write.
- [ ] Tests in `tests/control-routes-map.test.ts` covering: empty-body rejection, bad-JSON rejection, success path returns the same shape as before. TDD: red → green → refactor per criterion.
- [ ] Manually verified in the extension: forcing an error (e.g., misspelled `serverUrl`) produces a visible toast, not a silent failure.

## Blocked by

Nothing.

## Notes

- Out of scope (deferred): path-templating, status-coercion fixes (304→200, GET→ALL stripping), re-map confirm dialog, request-body capture. Each is a separate issue if/when raised.
- Edge case: `contentType` may be empty or `application/octet-stream` if the response was binary. These should be rejected as "non-mappable" with a clear message rather than silently written.
