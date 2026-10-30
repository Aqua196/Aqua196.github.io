/** 给站内链接加上 base 前缀（部署到 <user>.github.io/<repo>/ 时需要） */
export function url(path = '/'): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}` || '/';
}

export const postUrl = (id: string) => url(`/posts/${id}/`);
export const tagUrl = (tag: string) => url(`/tags/${encodeURIComponent(tag)}/`);
export const categoryUrl = (cat: string) => url(`/categories/${encodeURIComponent(cat)}/`);
