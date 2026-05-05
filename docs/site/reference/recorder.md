# Recorder reference

Capture network traffic from your app's DevTools panel and convert responses into local JSON mocks. The Chrome extension is the UI; the server-side recorder writes files and patches your server source.

## Server config

```ts
import { mockr, type Endpoints } from '@yoyo-org/mockr';

const server = await mockr<Endpoints>({
  port: 4000,
  recorder: {
    mocksDir:   './mocks',          // JSON files written here
    serverFile: './src/server.ts',  // patched on map
  },
  proxy: { target: 'https://api.example.com' },
  endpoints: [/* mapped routes get appended automatically */],
});
```

| Option | Description |
|---|---|
| `recorder.mocksDir` | Directory for generated `*.json` mocks. |
| `recorder.serverFile` | TS / JS source mockr edits when you map an entry. |
| `recorder.typesFile` | Optional separate file for the `Endpoints` type (defaults to `serverFile`). |

When recorder is enabled, mockr exposes control routes under `/__mockr/recorder/*` for the extension to drive.

## Chrome extension

```bash
cd chrome-extension
npm install && npm run build
```

Load unpacked from `chrome://extensions` (Developer mode → Load unpacked → select `chrome-extension/`).

### Workflow

1. Open your app, open DevTools → **mockr** panel.
2. XHR / fetch traffic streams in automatically.
3. Select entries (per row or *Select All API*).
4. Click **Map to mockr**.

Mockr then:
- Writes `mocks/<endpoint>.json` per selected entry.
- Generates a `.d.ts` with the response shape.
- Adds a `dataFile` entry to `serverFile`.
- Extends the `Endpoints` type with the new shape.
- Activates the route immediately — no restart.

## Mocked tab

Live view of every active endpoint:

| Control | Effect |
|---|---|
| Toggle | `enableEndpoint` / `disableEndpoint` |
| Editable URL | Rewrite path (e.g., `/api/projects/abc/items` → `/api/projects/*/items`) |
| Type selector | Switch between `data` / `dataFile` / `handler` |
| Delete | Remove entry from server file |

## `Recorder` API

`server.recorder` (when configured) exposes the lower-level surface used by the extension — useful for scripted ingestion:

| Member | Description |
|---|---|
| `record(entry)` | Persist one captured request. |
| `mapToMocks(ids[])` | Convert recorded entries into mocks (writes files + patches). |
| `listSessions()` / `getSession(id)` | Inspect recorded data. |

See `examples/` for end-to-end usage.
