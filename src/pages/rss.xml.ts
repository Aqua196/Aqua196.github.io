import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE } from '../config';
import { getPosts } from '../utils/posts';
import { postUrl } from '../utils/url';

export async function GET(context: APIContext) {
  const posts = await getPosts();
  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site!,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.date,
      link: postUrl(p.id),
      categories: [p.data.category, ...p.data.tags],
    })),
    customData: `<language>${SITE.lang}</language>`,
  });
}
