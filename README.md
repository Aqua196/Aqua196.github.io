# Writeup Lab

基于 [Astro](https://astro.build) 的静态博客，用来放 CTF / 算法题的解题 writeup，部署在 GitHub Pages。黑白配色，没有评论、点赞这类功能。

## 功能

- 首页：实时渲染的 ASCII 圆环、打字机效果、标签跑马灯、分类索引
- 文章：题目信息卡（比赛 / 分值 / 解出数 / 难度）、自动编号标题、吸顶目录、阅读进度
- Markdown 增强：代码窗口（文件名、行号、复制按钮）、KaTeX 数学公式、GitHub 风格提示块、可折叠 Hint、**Flag 黑条打码**
- 全站搜索（<kbd>Ctrl</kbd> + <kbd>K</kbd> 或 <kbd>/</kbd>），支持正文内容
- 归档时间线、分类、标签、RSS、sitemap
- 明暗主题切换（默认跟随系统），页面切换动画，适配手机

## 本地运行

需要 Node.js 22.22 或更高版本。

```bash
npm install
npm run dev       # 打开 http://localhost:4321
```

## 写文章

```bash
npm run new -- hitcon-2026-babyheap pwn
```

这条命令会创建 `src/content/posts/hitcon-2026-babyheap.md`，默认是草稿（`draft: true`）。草稿在 `npm run dev` 里能看到，但不会发布到线上。写完把它改成 `false` 就行。

文件名就是文章网址，建议用英文和短横线。需要图片的话，可以建一个文件夹，把 `index.md` 和图片放在一起，再用 `![](./xxx.png)` 引用。

所有写法（frontmatter 字段、提示块、Flag 打码、代码标题、公式）都在示例文章 **「博客使用指南 & Markdown 功能演示」**（`src/content/posts/getting-started.md`）里。`demo-*.md` 是示例 writeup，熟悉以后可以直接删掉。

## 改成你自己的信息

| 要改的 | 位置 |
| --- | --- |
| 站名、ID、简介、首页轮播短语、建站日期 | `src/config.ts` → `SITE` |
| 社交链接 | `src/config.ts` → `SOCIALS` |
| 分类名称 | `src/config.ts` → `CATEGORIES` |
| 关于页 | `src/pages/about.md` |
| 主题颜色 | `src/styles/global.css` 顶部的变量 |
| 代码高亮主题 | `astro.config.mjs` → `shikiConfig.themes` |

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库。如果仓库名是 **`<你的用户名>.github.io`**，网址就是 `https://<你的用户名>.github.io/`；用其他名字也可以，网址会变成 `https://<你的用户名>.github.io/<仓库名>/`，站内链接会自动适配。
2. 把代码推上去：
   ```bash
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```
3. 打开仓库的 **Settings → Pages**，把 **Source** 选成 **GitHub Actions**。
4. 以后每次 push 到 `main`，`.github/workflows/deploy.yml` 都会自动构建并发布，大约一分钟后生效。可以在仓库的 **Actions** 页面查看进度。

## 目录结构

```text
src/
├── config.ts              站点配置
├── content/posts/         文章（Markdown）
├── content.config.ts      frontmatter 字段定义
├── components/            页头、页脚、搜索、目录、文章列表等
├── layouts/               页面骨架
├── pages/                 路由（首页、归档、分类、标签、文章页、RSS、搜索索引）
├── plugins/               Markdown 插件（提示块、代码窗口、代码标题）
└── styles/                全局样式和正文排版
```
