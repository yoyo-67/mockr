# 12 — Forge file streaming (`ctx.file` + Range)

Stream a large binary file (multi-GB-capable) with HTTP Range support, no
full-body buffering. The real-world driver: the Autodesk **Forge / APS Viewer**
OTG loader fetches fragment-list files (`fragments.fl`, `fragments_extra.fl`)
for a model. mockr intercepts that request and streams a **substitute** `.fl` —
the job Elias built a separate server for.

`sendRaw` couldn't do this: it calls `Buffer.byteLength(body)` + `res.end(body)`,
holding the whole file in RAM, and ignores `Range`. `ctx.file()` streams via
`fs.createReadStream(...)` and answers `Range` with `206 Partial Content`.

## Run

```bash
# boot the server (serves a generated 4 MB substitute .fl)
npx tsx examples/12-forge-file-stream/server.ts

# or run the protocol harness — reproduces the Forge viewer's exact wire
# requests and verifies the streamed/ranged bytes (no Autodesk account needed)
npx tsx examples/12-forge-file-stream/forge-client.ts
```

The harness boots its own mockr. To point it at a different/running server:

```bash
npx tsx examples/12-forge-file-stream/forge-client.ts http://localhost:3012
```

## What the harness checks

Replaying the captured Forge request shape (`GET .../fragments_extra.fl`,
`Accept: */*`, `Sec-Fetch-Dest: empty`):

1. **Full GET** → `200`, `application/octet-stream`, `Content-Length` = file
   size, `Accept-Ranges: bytes`, and the body is **byte-for-byte identical**
   (the substitute mixes in `0xFF` bytes that any UTF-8 coercion would corrupt).
2. **Range probe** (`bytes=0-65535`) → `206` + correct `Content-Range`.
3. **Tail range** (`bytes=-4096`) → `206` + correct `Content-Range`.

## Testing against a *real* Forge viewer

When you have an APS token + a translated model URN, point the viewer's `.fl`
requests at mockr instead of the Autodesk derivative service (via your dev
proxy / a request rewrite). mockr's handler picks the substitute from
`req.params` (`urn`, `level`) and streams it. The OTG loader sees an ordinary
`200` (or `206`) octet-stream — identical to what this harness sends.

## The two API forms

```ts
// dynamic — choose the file per request (intercept case)
mockGroup<E>().get('/forge-lean/file/:urn/:level/fragments_extra.fl',
  (req, ctx) => ctx.file(`/data/${req.params.level}.fl`))

// static — always serve one file
mockr({ endpoints: [{ url: '/assets/big.fl', file: './data/big.fl' }] })
```
