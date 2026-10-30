---
title: broadcast：小指数 RSA 与 Håstad 广播攻击
date: 2026-09-03
description: 同一条明文用 e=3 发给了三个人，用中国剩余定理把三个密文合起来，开三次方根直接还原明文。
category: crypto
tags: [RSA, CRT, 小指数攻击]
event: DemoCTF 2026
difficulty: 2
points: 200
solves: 87
draft: true
---

> [!NOTE]
> 示例 writeup，题目为虚构。

## 题目

题目给出了三组公钥和密文，公钥指数都是 $e = 3$：

```python title="output.txt"
n1 = 0x9c2f...    c1 = 0x1d4b...
n2 = 0xb71a...    c2 = 0x63f0...
n3 = 0xd05e...    c3 = 0x2a91...
```

并且提示「同一份通知发给了三位同事」——同一个 $m$ 被加密了三次。

## 分析

三组密文满足：

$$
\begin{cases}
c_1 \equiv m^3 \pmod{n_1} \\
c_2 \equiv m^3 \pmod{n_2} \\
c_3 \equiv m^3 \pmod{n_3}
\end{cases}
$$

先检查 $\gcd(n_i, n_j) = 1$（如果不互素，直接 gcd 就分解了，更简单）。在模数两两互素的情况下，用**中国剩余定理**可以得到唯一的

$$
C \equiv m^3 \pmod{N}, \qquad N = n_1 n_2 n_3
$$

具体地，令 $N_i = N / n_i$，则

$$
C = \sum_{i=1}^{3} c_i \cdot N_i \cdot \left(N_i^{-1} \bmod n_i\right) \bmod N
$$

关键的一步：因为 $m < n_i$ 对每个 $i$ 都成立，所以

$$
m^3 < n_1 n_2 n_3 = N
$$

也就是说 $C$ **就是** $m^3$ 本身，不存在取模“绕回来”的情况，直接在整数上开三次方根即可。

> [!TIP]
> 推广：同一明文用指数 $e$ 发给 $k \ge e$ 个人，都可以这样做。如果每次加了**线性 padding**（$m_i = a_i m + b_i$），就需要用 Coppersmith 方法求小根，也就是完整版的 Håstad 攻击。

## 解题脚本

```python title="solve.py"
from functools import reduce
from math import gcd

from Crypto.Util.number import long_to_bytes
from gmpy2 import iroot

ns = [n1, n2, n3]
cs = [c1, c2, c3]

assert all(gcd(a, b) == 1 for i, a in enumerate(ns) for b in ns[i + 1:])

def crt(cs, ns):
    N = reduce(lambda a, b: a * b, ns)
    return sum(c * (N // n) * pow(N // n, -1, n) for c, n in zip(cs, ns)) % N

C = crt(cs, ns)
m, exact = iroot(C, 3)
assert exact, "不是完全立方数，说明有 padding"
print(long_to_bytes(int(m)))
```

> [!FLAG]
> flag{h4st4d_s4ys_d0nt_br04dc4st_w1th_sm4ll_e}

## 小结

- 小 $e$ + 无 padding 的 RSA 是不安全的，这也是 RSA 必须配合 OAEP 等填充方案的原因之一。
- 遇到多组 $(n, c)$ 的题目，先跑一遍两两 gcd，再看 $e$ 和明文是否相同。
