import { getCollection, type CollectionEntry } from 'astro:content';
import { CATEGORIES } from '../config';

export type Post = CollectionEntry<'posts'>;

/** 所有已发布文章，按日期倒序（置顶的排在最前） */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function getHomePosts(): Promise<Post[]> {
  const posts = await getPosts();
  return [...posts.filter((p) => p.data.pinned), ...posts.filter((p) => !p.data.pinned)];
}

export function countBy<T>(items: T[], key: (item: T) => string | string[]): [string, number][] {
  const map = new Map<string, number>();
  for (const item of items) for (const k of [key(item)].flat()) map.set(k, (map.get(k) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function categoryMeta(key: string) {
  return CATEGORIES[key] ?? { label: key };
}

/** 粗略阅读时间：中文 400 字/分钟，英文 200 词/分钟，代码按英文算 */
export function readingStats(body = '') {
  const cjk = (body.match(/[一-鿿぀-ヿ]/g) ?? []).length;
  const words = (body.replace(/[一-鿿぀-ヿ]/g, ' ').match(/[A-Za-z0-9_]+/g) ?? []).length;
  const minutes = Math.max(1, Math.round(cjk / 400 + words / 200));
  return { words: cjk + words, minutes };
}

export function formatDate(d: Date) {
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' }).replaceAll('/', '-');
}

/** 去掉 Markdown 语法，用于搜索索引 */
export function plainText(md = '') {
  return md
    .replace(/^---[\s\S]*?---/, '')
    .replace(/```[^\n]*\n/g, '\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^>\s*\[![^\]]+\][+-]?/gm, '')
    .replace(/[#>*_`~|$\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
