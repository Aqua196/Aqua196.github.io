import { getCollection, type CollectionEntry } from 'astro:content';
import { CATEGORIES } from '../config';
import { slugify } from './url';

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

/**
 * 按 slug 聚合标签：`Heap` 和 `heap` 算同一个标签，显示用出现次数最多的写法。
 * 返回值按文章数从多到少排序。
 */
export function tagGroups(posts: Post[]) {
  const groups = new Map<string, { slug: string; names: Map<string, number>; posts: Post[] }>();
  for (const post of posts) {
    for (const tag of new Set(post.data.tags)) {
      const slug = slugify(tag);
      const g = groups.get(slug) ?? { slug, names: new Map(), posts: [] };
      g.names.set(tag, (g.names.get(tag) ?? 0) + 1);
      if (!g.posts.includes(post)) g.posts.push(post);
      groups.set(slug, g);
    }
  }
  return [...groups.values()]
    .map(({ slug, names, posts }) => ({
      slug,
      name: [...names].sort((a, b) => b[1] - a[1])[0][0],
      posts,
    }))
    .sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name));
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

/**
 * 去掉 Markdown 语法，用于搜索索引。
 * - 删掉 `> [!FLAG]` 块和 `<span class="spoiler">`，否则 flag 会从搜索里漏出去
 * - 保留 `_` 和 `-`：`log_level`、`__free_hook`、`x86-64` 这类标识符要能搜到
 */
export function plainText(md = '') {
  return md
    .replace(/^---[\s\S]*?---/, '')
    .replace(/^>[ \t]*\[!FLAG\][^\n]*(?:\n>[^\n]*)*/gim, '')
    .replace(/<span[^>]*class=["'][^"']*\bspoiler\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/```[^\n]*\n/g, '\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^>[ \t]*\[![^\]]+\][+-]?/gm, '')
    .replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, '')
    .replace(/^[ \t]*(?:#{1,6}|>+)[ \t]*/gm, '')
    .replace(/[*`~|$\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
