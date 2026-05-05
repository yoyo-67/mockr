# CLI reference

Override config from the command line — no need to maintain dev / prod variants of the same server file.

```bash
npx tsx mock.ts --port 3000
npx tsx mock.ts --proxy https://api.example.com
npx tsx mock.ts --recorder
npx tsx mock.ts --tui
npx tsx mock.ts --help
```

| Flag | Description |
|---|---|
| `--port <n>` | Override `mockr({ port })`. |
| `--proxy <url>` | Set / replace `proxy.target`. Enables proxy passthrough. |
| `--recorder` | Force-enable the recorder. |
| `--tui` | Boot the terminal UI. |
| `--help`, `-h` | Print usage. |

CLI flags win over file config — handy for `npm run dev` vs `npm run dev:rec`.

## Watch mode

`tsx watch` respawns on TS changes:

```jsonc
// package.json
{ "scripts": { "dev": "tsx watch src/server.ts" } }
```

JSON `dataFile` changes are handled in-process by mockr (debounced 100ms, no respawn). Don't add `--include 'src/**/*.json'` — it makes tsx restart on JSON edits and competes with mockr's hot-reload.
