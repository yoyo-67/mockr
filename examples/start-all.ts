// Start all example servers at once.
// Usage: npx tsx examples/start-all.ts

export {};

const examples = ['todo', 'ecommerce', 'auth-api', 'chat', 'batch-monitor', 'proxy'];

console.log('Starting all example servers...\n');

await Promise.all(
  examples.map((name) => import(`./${name}/server.ts`))
);

console.log('\nAll servers running. Press Ctrl+C to stop.');
