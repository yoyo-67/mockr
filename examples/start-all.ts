// Start all example servers at once.
// Usage: npx tsx examples/start-all.ts

export {};

const examples = [
  '01-data-list',
  '02-data-files',
  '03-cross-endpoint',
  '04-handlers-zod',
  '05-middleware',
  '06-scenarios',
  '07-multi-method',
  '08-proxy',
  '09-forward',
  '10-everything',
];

console.log('Starting all example servers...\n');

await Promise.all(
  examples.map((name) => import(`./${name}/server.ts`))
);

console.log('\nAll servers running. Press Ctrl+C to stop.');
