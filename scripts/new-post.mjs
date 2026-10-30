// 用法：npm run new -- <文件名> [分类]
// 例如：npm run new -- hitcon-2026-babyheap pwn
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [name, category = 'misc'] = process.argv.slice(2);
if (!name) {
  console.error('用法：npm run new -- <文件名> [分类]\n例如：npm run new -- hitcon-2026-babyheap pwn');
  process.exit(1);
}

const slug = name.trim().replace(/\s+/g, '-');
const dir = join('src', 'content', 'posts');
const file = join(dir, `${slug}.md`);
if (existsSync(file)) {
  console.error(`已存在：${file}`);
  process.exit(1);
}

const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
mkdirSync(dir, { recursive: true });
writeFileSync(
  file,
  `---
title: ${slug}
date: ${today}
description:
category: ${category}
tags: []
event:
difficulty: 3
draft: true
---

## 题目信息

## 分析

## 利用 / 解法

\`\`\`python title="exp.py"
from pwn import *
\`\`\`

> [!FLAG]
> flag{}
`,
);
console.log(`✨ 已创建 ${file}（draft: true，写完记得改成 false）`);
