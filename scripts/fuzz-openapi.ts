/**
 * Integration fuzz: boot a mock server, point schemathesis at the OpenAPI spec
 * mockr emits about itself, and hammer every operation with generated inputs.
 * The spec's servers[0].url is the live server, so schemathesis sends real
 * requests. Fails (non-zero exit) if any operation returns a 5xx or otherwise
 * trips a schemathesis check.
 *
 *   npm run fuzz:openapi
 *
 * Requires `uvx` (ships with uv) — schemathesis runs without a local install.
 */
import { spawn } from 'node:child_process';
import { mockr } from '../src/index.js';
import { mockGroup } from '../src/mock-group.js';
import { z } from 'zod';

type E = {
  '/api/todos': { id: string; title: string; done: boolean }[];
  '/api/config': { theme: string };
  '/api/projects/:projectId/items/': { id: string }[];
  '/api/things': { id: string };
};

const defs = mockGroup<E>()
  .data('/api/todos', [{ id: '1', title: 'a', done: false }])
  .data('/api/config', { theme: 'dark' })
  .data('/api/projects/:projectId/items/', [{ id: '1' }])
  .post('/api/things', {
    body: z.object({ name: z.string(), count: z.number().int() }),
    fn: () => ({ status: 201, body: { id: '1' } }),
  })
  .done();

const MAX_EXAMPLES = process.env.FUZZ_EXAMPLES ?? '50';

const server = await mockr({ endpoints: defs as never });
const specUrl = `${server.url}/__mockr/openapi.json`;
console.log(`[fuzz] mock server: ${server.url}`);
console.log(`[fuzz] spec:        ${specUrl}`);
console.log(`[fuzz] running schemathesis (max ${MAX_EXAMPLES} examples/op)...`);

const child = spawn(
  'uvx',
  [
    'schemathesis',
    'run',
    specUrl,
    '--max-examples',
    MAX_EXAMPLES,
  ],
  { stdio: 'inherit' },
);

const code: number = await new Promise((resolve) => {
  child.on('close', (c) => resolve(c ?? 1));
  child.on('error', (err) => {
    console.error('[fuzz] failed to launch uvx/schemathesis:', err.message);
    resolve(127);
  });
});

await server.close();
process.exit(code);
