// Forge viewer protocol harness — reproduces the exact wire requests the
// Autodesk APS / Forge Viewer's OTG fragment loader issues for a `.fl` file,
// then verifies mockr streams the bytes correctly (full + Range). No Autodesk
// account, SDK, token, or translated model required: this replays the captured
// request shape byte-for-byte.
//
// Run:  npx tsx examples/12-forge-file-stream/forge-client.ts
//   (boots its own mockr; pass a URL to test a running/real server instead:
//    npx tsx examples/12-forge-file-stream/forge-client.ts http://localhost:3012)

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { start, PORT, SUBSTITUTE } from './server.ts';

// Headers a real Forge viewer XHR sends for a derivative asset (from capture).
const VIEWER_HEADERS: Record<string, string> = {
  Accept: '*/*',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

const URN = 'dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6Zm9vL2Jhci5ydnQ'; // sample base64 urn
const PATH = `/forge-lean/file/${URN}/level-0/fragments_extra.fl`;

const sha = (b: Buffer | Uint8Array) => createHash('sha256').update(b).digest('hex');

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

async function main() {
  const arg = process.argv[2];
  let close: (() => Promise<void>) | null = null;
  let base: string;

  if (arg) {
    base = arg.replace(/\/$/, '');
    console.log(`Testing running server: ${base}`);
  } else {
    const server = await start();
    base = `http://localhost:${PORT}`;
    close = () => server.close();
    console.log(`Booted mockr at ${base}`);
  }

  const expected = readFileSync(SUBSTITUTE);
  const total = expected.length;
  console.log(`Substitute .fl: ${total} bytes (sha256 ${sha(expected).slice(0, 16)}…)\n`);

  // 1) The captured request: a plain full GET of fragments_extra.fl.
  console.log('1. Full GET (the request Forge actually sends):');
  {
    const res = await fetch(base + PATH, { headers: VIEWER_HEADERS });
    const body = Buffer.from(await res.arrayBuffer());
    check('200 OK', res.status === 200, `got ${res.status}`);
    check('Content-Type application/octet-stream', res.headers.get('content-type') === 'application/octet-stream');
    check('Content-Length matches file', res.headers.get('content-length') === String(total));
    check('Accept-Ranges: bytes advertised', res.headers.get('accept-ranges') === 'bytes');
    check('bytes are byte-for-byte identical (no UTF-8 corruption)', body.length === total && sha(body) === sha(expected));
  }

  // 2) Range probe — a progressive/seek loader reads a leading chunk first.
  console.log('\n2. Range probe (bytes=0-65535):');
  {
    const res = await fetch(base + PATH, { headers: { ...VIEWER_HEADERS, Range: 'bytes=0-65535' } });
    const body = Buffer.from(await res.arrayBuffer());
    check('206 Partial Content', res.status === 206, `got ${res.status}`);
    check('Content-Range correct', res.headers.get('content-range') === `bytes 0-65535/${total}`);
    check('chunk length 65536', body.length === 65536);
    check('chunk bytes match file slice', sha(body) === sha(expected.subarray(0, 65536)));
  }

  // 3) Tail range — a loader reading a trailing index/footer.
  console.log('\n3. Tail range (bytes=-4096):');
  {
    const res = await fetch(base + PATH, { headers: { ...VIEWER_HEADERS, Range: 'bytes=-4096' } });
    const body = Buffer.from(await res.arrayBuffer());
    check('206 Partial Content', res.status === 206, `got ${res.status}`);
    check('Content-Range correct', res.headers.get('content-range') === `bytes ${total - 4096}-${total - 1}/${total}`);
    check('tail bytes match file slice', sha(body) === sha(expected.subarray(total - 4096)));
  }

  if (close) await close();

  console.log(`\n${failures === 0 ? '✓ PASS' : `✗ FAIL (${failures})`} — Forge protocol replay`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
