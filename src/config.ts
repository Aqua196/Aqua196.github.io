// ============================================================
//  站点配置 —— 改这里就能换成你自己的信息
// ============================================================

export const SITE = {
  /** 浏览器标签页 / RSS 里显示的站点名 */
  title: 'Writeup Lab',
  /** 首页大标题（可以写你的 ID） */
  author: 'Aqua196',
  /** 一句话介绍，用于 SEO 和首页 */
  description: '记录 CTF 与算法题的解题思路、踩坑和 exp。',
  /** 首页大标题下的一行小字 */
  subtitle: 'CTF / Algorithms / Writeups',
  /** 首页打字机轮播的短语 */
  taglines: [
    'pwn the heap, own the shell',
    'break the crypto, recover the key',
    'reverse the binary, read the mind',
    'think twice, AC once',
  ],
  /** 首页显示最近多少篇 */
  homePostCount: 9,
  /** 建站日期，页脚会显示 “已运行 X 天” */
  since: '2026-10-30',
  /** 语言 */
  lang: 'zh-CN',
};

/** 社交链接，留空字符串的项不会显示 */
export const SOCIALS = {
  github: 'https://github.com/Aqua196',
  email: '',
  twitter: '',
  bilibili: '',
};

/**
 * 分类：key 写在文章 frontmatter 的 category 里，label 是显示名。
 * 不在这里的分类也能用，会直接显示 key。
 */
export const CATEGORIES: Record<string, { label: string }> = {
  pwn: { label: 'Pwn' },
  web: { label: 'Web' },
  crypto: { label: 'Crypto' },
  reverse: { label: 'Reverse' },
  misc: { label: 'Misc' },
  forensics: { label: 'Forensics' },
  algo: { label: 'Algorithm' },
};

export const NAV = [
  { href: '/', label: '首页' },
  { href: '/archive', label: '归档' },
  { href: '/categories', label: '分类' },
  { href: '/tags', label: '标签' },
  { href: '/about', label: '关于' },
];
