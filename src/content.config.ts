import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  // 支持 posts/foo.md 和 posts/foo/index.md（后者方便把图片放在同一目录）
  loader: glob({ base: './src/content/posts', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    description: z.string().default(''),
    /** 分类 key，见 src/config.ts 的 CATEGORIES */
    category: z.string().default('misc'),
    tags: z.array(z.string()).default([]),
    /** 比赛 / 平台名，比如 "HITCON CTF 2026"、"Codeforces Round 999" */
    event: z.string().optional(),
    /** 难度 1~5 */
    difficulty: z.number().int().min(1).max(5).optional(),
    points: z.number().optional(),
    solves: z.number().optional(),
    /** 原题链接 */
    source: z.string().url().optional(),
    /** 置顶 */
    pinned: z.boolean().default(false),
    /** 草稿不会被构建 */
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
