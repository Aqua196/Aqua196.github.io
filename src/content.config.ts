import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// frontmatter 里写了 key 但没填值（比如 `event:`）会被 YAML 解析成 null，
// 这里统一当成“没填”，避免一篇没写完的草稿让整站构建失败。
const blank = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === null || v === '' ? undefined : v), schema);

const posts = defineCollection({
  // 支持 posts/foo.md 和 posts/foo/index.md（后者方便把图片放在同一目录）
  loader: glob({ base: './src/content/posts', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.coerce.string(),
    date: z.coerce.date(),
    updated: blank(z.coerce.date().optional()),
    description: blank(z.coerce.string().default('')),
    /** 分类 key，见 src/config.ts 的 CATEGORIES */
    category: blank(z.coerce.string().default('misc')).transform((s) => s.trim().toLowerCase()),
    tags: blank(z.array(z.coerce.string()).default([])),
    /** 比赛 / 平台名，比如 "HITCON CTF 2026"、"Codeforces Round 999" */
    event: blank(z.coerce.string().optional()),
    /** 难度 1~5 */
    difficulty: blank(z.number().int().min(1).max(5).optional()),
    points: blank(z.number().optional()),
    solves: blank(z.number().optional()),
    /** 原题链接 */
    source: blank(z.string().url().optional()),
    /** 置顶 */
    pinned: blank(z.boolean().default(false)),
    /** 草稿不会被构建 */
    draft: blank(z.boolean().default(false)),
  }),
});

export const collections = { posts };
