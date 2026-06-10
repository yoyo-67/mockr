// Feature: ctx.file() / static `{ url, file }` — stream a (multi-GB-capable)
// binary file with HTTP Range support, no full-body buffering.
//
// The real-world case: the Autodesk Forge / APS Viewer's OTG loader fetches
// fragment-list files (`fragments.fl`, `fragments_extra.fl`) for a model. This
// server intercepts that request and streams a *substitute* `.fl` instead — the
// thing Elias built a dedicated server for, now done by mockr.
//
// Run:  npx tsx examples/12-forge-file-stream/server.ts
// Then: npx tsx examples/12-forge-file-stream/forge-client.ts  (the harness)
//   or: point a real Forge viewer's .fl requests at http://localhost:3012

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockr } from '../../src/index.js';
import { mockGroup } from '../../src/mock-group.js';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '.data');
mkdirSync(dataDir, { recursive: true });

// Generate a deterministic binary substitute `.fl` (4 MB) if missing. Mix in
// 0xFF/0xFE/0x00 so any UTF-8 coercion bug would corrupt it visibly.
export const SUBSTITUTE = join(dataDir, 'fragments_extra.fl');
export function buildSubstitute(sizeBytes = 4 * 1024 * 1024): Buffer {
  const buf = Buffer.allocUnsafe(sizeBytes);
  for (let i = 0; i < sizeBytes; i++) buf[i] = (i * 31 + (i >> 8)) & 0xff;
  // Sprinkle bytes that are invalid as standalone UTF-8.
  for (let i = 0; i < sizeBytes; i += 997) buf[i] = 0xff;
  return buf;
}
if (!existsSync(SUBSTITUTE)) writeFileSync(SUBSTITUTE, buildSubstitute());

// The Forge OTG loader URL shape (urn = base64 model id, then a level/view id).
type Endpoints = {
  '/forge-lean/file/:urn/:level/fragments_extra.fl': unknown;
};

export const PORT = 3012;

export async function start() {
  return mockr<Endpoints>({
    port: PORT,
    endpoints: mockGroup<Endpoints>()
      // Dynamic intercept: choose the substitute per request (urn/level in
      // req.params). Here we always serve the one file; a real setup keys off
      // params. mockr streams it + honors Range automatically.
      .get('/forge-lean/file/:urn/:level/fragments_extra.fl', (_req, ctx) => ctx.file(SUBSTITUTE))
      .done(),
  });
}

// Run standalone (not when imported by the harness).
if (import.meta.url === `file://${process.argv[1]}`) {
  await start();
  console.log(`Forge file-stream example running at http://localhost:${PORT}`);
  console.log(`  GET  /forge-lean/file/:urn/:level/fragments_extra.fl   stream (+ Range)`);
  console.log(`Serving substitute: ${SUBSTITUTE}`);
}
