# Writeup Lab

基于 [Astro](https://astro.build) 的静态博客，用来放 CTF / 算法题的解题 writeup，部署在 GitHub Pages。衬线大标题 + 等宽小字的杂志式排版，一个水色主色，每个分类有自己的代表色；没有评论、点赞这类功能。

## 功能

- **首页粒子雕塑**：手写 WebGL2（没有用 three.js）。十几万个粒子的位置和速度都存在显存里，每帧用 transform feedback 做物理积分；可以拖动旋转、用鼠标搅动、点击切换形状（三叶结 / 莫比乌斯带 / 克莱因瓶 / 博罗梅安环，最后粒子会拼出 ID 里的数字），往下滚会被吹散。404 页的大字也是同一个引擎拼的。掉帧时自动降画质，不支持 WebGL2 时退回 Canvas 2D 版本
- **命令面板**：<kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>K</kbd> 或 <kbd>/</kbd> 打开，全文搜索文章；输入 <kbd>&gt;</kbd> 执行命令（跳转、切主题、随机一篇……）
- **浏览器里的终端**：按 <kbd>`</kbd> 打开。支持 `ls` / `cd` / `cat` / `grep` / `open`、管道、Tab 补全和历史记录，文件系统由站内文章生成；里面藏了一个 flag
- **文章**：题目信息卡（比赛 / 分值 / 解出数 / 难度）、自动编号标题、带滑动指示条的吸顶目录、标题锚点（点击复制链接）、阅读进度
- **Markdown 增强**：代码窗口（文件名、行号、复制按钮）、KaTeX 数学公式、GitHub 风格提示块、可折叠 Hint、**Flag 黑条打码**
- **动效**：页面切换用 View Transitions（文章标题会从列表飞到页头，导航胶囊会滑到新位置，图片点开时从原位放大）、卡片上的指针光斑与倾斜、按钮磁吸、页脚会“涨水”的字标；系统开了“减弱动态效果”时全部关闭
- 归档时间线、分类（每个分类一个代表色）、标签、RSS、sitemap，明暗主题（默认跟随系统），适配手机
- `/colophon` 页面逐条说明了这些是怎么实现的

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

文件名就是文章网址，建议用英文和短横线。需要图片的话，可以建一个文件夹，把 `index.md` 和图片放在一起，再用 `![](./xxx.png)` 引用。注意要用 Markdown 的图片写法，HTML 的 `<img src="./xxx.png">` 不会被处理。

所有写法（frontmatter 字段、提示块、Flag 打码、代码标题、公式）都在 **「博客使用指南 & Markdown 功能演示」**（`src/content/posts/getting-started.md`）里。它和 `demo-*.md` 几篇示例 writeup 都是草稿，只在 `npm run dev` 时显示，不会发布；熟悉以后可以直接删掉。

## 改成你自己的信息

| 要改的 | 位置 |
| --- | --- |
| 站名、ID、简介、首页轮播短语、建站日期 | `src/config.ts` → `SITE` |
| 社交链接 | `src/config.ts` → `SOCIALS` |
| 分类名称和代表色 | `src/config.ts` → `CATEGORIES`（`hue` 是色相，0~360） |
| 关于页 | `src/pages/about.md` |
| 分享卡片图（发链接时显示的预览图） | `public/og.png`，1200×630；改了 ID 后记得换一张 |
| 主题颜色 | `src/styles/global.css` 顶部的变量（主色是 `--accent`，明暗两套各改一处） |
| 字体 | `src/styles/global.css` 的 `--font-display` / `--font-body` / `--font-mono` |
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
├── components/            页头、页脚、命令面板、终端、目录、文章列表等
├── layouts/               页面骨架
├── pages/                 路由（首页、归档、分类、标签、文章页、colophon、RSS、搜索索引）
├── plugins/               Markdown 插件（提示块、代码窗口、代码标题）
├── scripts/               首页粒子引擎（particles.ts）、曲面定义、CPU 降级渲染、指针效果
└── styles/                全局样式和正文排版
```
