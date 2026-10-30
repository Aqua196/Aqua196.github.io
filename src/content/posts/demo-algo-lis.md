---
title: 最长上升子序列：从 O(n²) 到 O(n log n)
date: 2025-12-20
description: LIS 的两种经典解法，重点理解「贪心 + 二分」中 g 数组的含义和单调性证明。
category: algo
tags: [DP, 二分, 贪心, LeetCode]
event: LeetCode 300
difficulty: 3
source: https://leetcode.cn/problems/longest-increasing-subsequence/
draft: true
---

> [!NOTE]
> 示例文章，演示算法题 writeup 的写法。

## 题意

给定整数数组 `nums`，求其中**严格递增子序列**的最长长度。$1 \le n \le 2500$，进阶要求 $O(n \log n)$。

## 解法一：朴素 DP

设 $f_i$ 为以 $a_i$ 结尾的最长上升子序列长度：

$$
f_i = 1 + \max_{\substack{j < i \\ a_j < a_i}} f_j
$$

答案是 $\max_i f_i$，时间复杂度 $O(n^2)$。

## 解法二：贪心 + 二分

换一个状态：令 $g_k$ 表示**所有长度为 $k$ 的上升子序列中，结尾元素的最小值**。

> [!IMPORTANT] 关键性质
> $g$ 是严格单调递增的。

**证明**：假设 $g_k \ge g_{k+1}$。取一个长度为 $k+1$、结尾为 $g_{k+1}$ 的上升子序列，删掉它的最后一个元素，得到一个长度为 $k$ 的上升子序列，其结尾严格小于 $g_{k+1} \le g_k$，与 $g_k$ 的最小性矛盾。$\blacksquare$

于是依次处理每个 $x$：

- 如果 $x$ 比所有 $g_k$ 都大，就接在最后，长度 $+1$；
- 否则找到第一个 $g_k \ge x$ 的位置，用 $x$ 替换它（结尾更小，对后面更有利）。

因为 $g$ 单调，「第一个 $\ge x$ 的位置」可以二分，总复杂度 $O(n \log n)$。

```cpp title="solution.cpp"
class Solution {
public:
    int lengthOfLIS(vector<int>& nums) {
        vector<int> g;
        for (int x : nums) {
            auto it = lower_bound(g.begin(), g.end(), x);
            if (it == g.end()) g.push_back(x);
            else *it = x;
        }
        return g.size();
    }
};
```

> [!BUG] 易错点
> 1. `g` **不是**最长上升子序列本身，只有长度是对的。要输出方案需要额外记录前驱。
> 2. 如果题目要求的是**不下降**子序列，要把 `lower_bound` 换成 `upper_bound`。

## 复杂度

| 解法 | 时间 | 空间 |
| --- | --- | --- |
| 朴素 DP | $O(n^2)$ | $O(n)$ |
| 贪心 + 二分 | $O(n \log n)$ | $O(n)$ |
