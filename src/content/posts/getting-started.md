---
title: 博客使用指南 & Markdown 功能演示
date: 2026-10-30
description: 写 writeup 之前先看这篇：frontmatter 字段、提示块、Flag 打码、代码窗口、数学公式……所有功能一页看完。
category: misc
tags: [博客, 指南]
pinned: true
---

这篇文章既是**使用说明**，也是**功能演示**。把它删掉或者设成 `draft: true` 就不会出现在网站上了。

## 新建一篇文章

在 `src/content/posts/` 下新建一个 `.md` 文件就是一篇文章，**文件名就是网址**（建议用英文和短横线）：

```text
src/content/posts/hitcon-2026-babyheap.md   →   /posts/hitcon-2026-babyheap/
```

也可以用命令一键生成模板：

```bash
npm run new -- hitcon-2026-babyheap
```

如果文章有图片，可以建一个同名文件夹，把图片和 `index.md` 放在一起，然后用相对路径引用 `![](./heap.png)`。

## Frontmatter 字段

文件开头 `---` 之间的部分就是 frontmatter：

```yaml title="src/content/posts/example.md"
---
title: baby_heap                 # 必填：标题
date: 2026-10-30                 # 必填：日期
description: 一句话摘要           # 显示在卡片和搜索结果里
category: pwn                    # 分类，见 src/config.ts
tags: [heap, tcache, glibc-2.31]
event: HITCON CTF 2026           # 比赛 / 平台（可选）
difficulty: 3                    # 难度 1~5，显示成方块（可选）
points: 300                      # 分值（可选）
solves: 42                       # 解出人数（可选）
source: https://example.com      # 原题链接（可选）
pinned: false                    # 置顶
draft: false                     # 草稿，不会发布
---
```

填了 `event / difficulty / points / solves / source` 中任意一个，文章顶部就会出现一张「题目信息」卡片。

## 提示块

用 GitHub 风格的语法：

```md
> [!TIP] 自定义标题（可省略）
> 内容
```

> [!NOTE]
> 这是 `NOTE`，适合补充说明。

> [!TIP] 小技巧
> 这是 `TIP`，标题可以自定义。

> [!WARNING]
> 这是 `WARNING`，适合写“这里容易踩坑”。

> [!BUG] 我踩过的坑
> 本地能打通、远程打不通？先检查 libc 版本和栈对齐。

> [!QUESTION]
> 这是 `QUESTION`，可以留一些思考题。

在类型后面加 `-` 就会变成**默认折叠**的块，很适合放 hint：

> [!HINT]- 点我看 Hint
> 注意 `delete` 之后指针没有清空。

支持的类型：`NOTE` `INFO` `TIP` `HINT` `IMPORTANT` `WARNING` `CAUTION` `DANGER` `BUG` `SUCCESS` `QUESTION` `QUOTE` `FLAG`。

## Flag 打码

`FLAG` 类型的提示块默认被黑条涂掉，读者点一下才会显示，防止“剧透”：

> [!FLAG]
> flag{th1s_1s_4_d3m0_fl4g}

行内也可以打码：答案是 <span class="spoiler">42</span>（点一下）。写法是 `<span class="spoiler">42</span>`。

## 代码

代码块自带窗口样式、语言标签、行号和复制按钮。在语言后面加 `title="..."` 可以显示文件名：

```python title="exp.py"
from pwn import *

context(arch="amd64", log_level="debug")
io = remote("chall.example.com", 1337)

payload = flat({0x28: 0xdeadbeef})
io.sendlineafter(b"> ", payload)
io.interactive()
```

```c
int main(void) {
    char buf[0x20];
    puts("input:");
    read(0, buf, 0x100); // stack overflow!
    return 0;
}
```

行内代码长这样：`0x7ffff7a0d000`。

## 数学公式

用 `$...$` 写行内公式，比如 $a^{\varphi(n)} \equiv 1 \pmod n$；用 `$$...$$` 写独立公式：

$$
\sum_{k=1}^{n} k^2 = \frac{n(n+1)(2n+1)}{6}
$$

## 表格、列表与其他

| 保护 | 状态 |
| --- | --- |
| RELRO | Full |
| Canary | ✓ |
| NX | ✓ |
| PIE | ✗ |

- [x] 泄露 libc
- [x] 劫持控制流
- [ ] 写完 writeup

快捷键 <kbd>Ctrl</kbd> + <kbd>K</kbd> 或 <kbd>/</kbd> 可以打开全站搜索。

脚注也是支持的[^1]。

[^1]: 就像这样。
