import * as esbuild from 'esbuild';
import { execSync } from 'child_process';

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
    entryPoints: ['devtools/panel.tsx'],
    outfile: 'devtools/panel.js',
    jsx: 'automatic',
  },
];

// Build Tailwind CSS
function buildCss() {
  execSync('npx @tailwindcss/cli -i devtools/panel.css -o devtools/panel.built.css --minify', { stdio: 'inherit' });
}

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
  buildCss();
  console.log('Build complete');
}
