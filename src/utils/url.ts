/**
 * 标签 / 分类 → 网址里用的 slug：统一小写，只保留字母（含中文）、数字和 . _ ~ -，
 * 其他字符（# ? % + / 空格等）在不同服务器上解码规则不一，统一换掉。
 */
export function slugify(s: string): string {
  const slug = s
    .trim()
    .toLowerCase()
    .replace(/#/g, '-sharp')
    .replace(/\+/g, '-plus')
    .replace(/[^\p{L}\p{N}._~-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'untitled';
}

/**
 * 给站内链接加上 base 前缀（部署到 <user>.github.io/<repo>/ 时需要），
 * 并补上结尾斜杠，免得 GitHub Pages 每次多一次 301 跳转。
 */
export function url(path = '/'): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  let p = path.startsWith('/') ? path : `/${path}`;
  const last = p.split('/').pop() ?? '';
  if (!p.endsWith('/') && !last.includes('.')) p += '/';
  return `${base}${p}`;
}

export const postUrl = (id: string) => url(`/posts/${id}/`);
export const tagUrl = (tag: string) => url(`/tags/${encodeURIComponent(slugify(tag))}/`);
export const categoryUrl = (cat: string) => url(`/categories/${encodeURIComponent(slugify(cat))}/`);
