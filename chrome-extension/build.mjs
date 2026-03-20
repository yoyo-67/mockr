import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const commonOptions = {
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  sourcemap: true,
};

const configs = [
  {
    ...commonOptions,
    entryPoints: ['devtools/devtools.ts'],
    outfile: 'devtools/devtools.js',
  },
  {
    ...commonOptions,
    entryPoints: ['devtools/panel.ts'],
    outfile: 'devtools/panel.js',
  },
  {
    ...commonOptions,
    entryPoints: ['background/service-worker.ts'],
    outfile: 'background/service-worker.js',
  },
];

if (watch) {
  for (const config of configs) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
  }
  console.log('Watching for changes...');
} else {
  for (const config of configs) {
    await esbuild.build(config);
  }
  console.log('Build complete');
}
