// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkCallouts from './src/plugins/remark-callouts.mjs';
import remarkCodeTitle from './src/plugins/remark-code-title.mjs';
import rehypeCodeWindow from './src/plugins/rehype-code-window.mjs';

// 在 GitHub Actions 里，SITE / BASE_PATH 由 actions/configure-pages 自动给出，
// 所以无论仓库叫 <用户名>.github.io 还是别的名字都能正确部署。
// 本地开发时用下面的默认值即可。
const site = process.env.SITE || 'https://aqua196.github.io';
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      themes: { light: 'vitesse-light', dark: 'vitesse-black' },
      defaultColor: false,
      wrap: false,
    },
    processor: unified({
      remarkPlugins: [remarkMath, remarkCallouts, remarkCodeTitle],
      rehypePlugins: [
        [rehypeKatex, { strict: false }],
        // bg 要和 global.css 里两套主题的 --code-bg 一致：高亮配色按它校正对比度
        [rehypeCodeWindow, { bg: { light: '#fdfdfb', dark: '#0e1114' } }],
      ],
      remarkRehype: { footnoteLabel: '脚注', footnoteBackLabel: '返回正文' },
    }),
  },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
});
