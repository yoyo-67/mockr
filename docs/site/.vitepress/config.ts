import { defineConfig } from 'vitepress';

const REPO = 'yoyo-67/mockr';
const BRANCH = 'experiments';
const stackblitz = (path: string) =>
  `https://stackblitz.com/github/${REPO}/tree/${BRANCH}/${path}?file=server.ts&startScript=tutorial`;

export default defineConfig({
  title: 'mockr',
  description: 'Mock API server for frontend prototyping. Define endpoints, get full CRUD for free.',
  base: '/',
  cleanUrls: true,
  appearance: 'dark',
  themeConfig: {
    nav: [
      { text: 'Tutorial', link: '/tutorial/' },
      { text: 'GitHub', link: `https://github.com/${REPO}` },
      { text: 'npm', link: 'https://www.npmjs.com/package/@yoyo-org/mockr' },
    ],
    sidebar: {
      '/tutorial/': [
        {
          text: 'Tutorial',
          items: [
            { text: 'Overview', link: '/tutorial/' },
            { text: '01 — data list (free CRUD)', link: '/tutorial/01-data-list' },
            { text: '02 — data files (hot-reload)', link: '/tutorial/02-data-files' },
            { text: '03 — cross-endpoint joins', link: '/tutorial/03-cross-endpoint' },
            { text: '04 — handlers + zod', link: '/tutorial/04-handlers-zod' },
            { text: '05 — middleware', link: '/tutorial/05-middleware' },
            { text: '06 — scenarios', link: '/tutorial/06-scenarios' },
            { text: '07 — multi-method', link: '/tutorial/07-multi-method' },
            { text: '08 — proxy passthrough', link: '/tutorial/08-proxy' },
            { text: '09 — ctx.forward()', link: '/tutorial/09-forward' },
            { text: '10 — everything', link: '/tutorial/10-everything' },
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: `https://github.com/${REPO}` }],
    search: { provider: 'local' },
    footer: {
      message: 'MIT License',
      copyright: 'mockr',
    },
  },
  vite: {
    define: {
      __STACKBLITZ_BASE__: JSON.stringify(`https://stackblitz.com/github/${REPO}/tree/${BRANCH}`),
    },
  },
});

export { stackblitz };
