import { getPosts, categoryMeta, formatDate, plainText } from '../utils/posts';
import { postUrl } from '../utils/url';

export async function GET() {
  const posts = await getPosts();
  const index = posts.map((p) => {
    const c = categoryMeta(p.data.category);
    return {
      title: p.data.title,
      url: postUrl(p.id),
      description: p.data.description,
      category: p.data.category,
      categoryLabel: c.label,
      hue: c.hue,
      tags: p.data.tags,
      event: p.data.event ?? '',
      date: formatDate(p.data.date),
      body: plainText(p.body).slice(0, 20000),
    };
  });
  return new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json' } });
}
