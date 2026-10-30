// 把 Shiki 生成的 <pre> 包成一个带标题栏（文件名 / 语言 / 复制按钮）的代码窗口
const h = (tagName, className, children = [], properties = {}) => ({
  type: 'element',
  tagName,
  properties: { ...(className.length ? { className } : {}), ...properties },
  children,
});
const text = (value) => ({ type: 'text', value });

// Astro 的 Shiki 输出用的是 properties.class（字符串），兼容一下 className（数组）
const classList = (node) =>
  [].concat(node.properties?.className ?? [], String(node.properties?.class ?? '').split(/\s+/));
const isShikiPre = (node) => node.type === 'element' && node.tagName === 'pre' && classList(node).includes('astro-code');

function wrap(pre, title) {
  const lang = String(pre.properties?.dataLanguage ?? 'text');
  const label = lang === 'plaintext' ? 'text' : lang;
  return h('figure', ['code-window'], [
    h('figcaption', ['code-header'], [
      h('span', ['code-title'], [text(title ?? '')]),
      h('span', ['code-lang'], [text(label)]),
      h('button', ['code-copy'], [text('copy')], { type: 'button', ariaLabel: '复制代码' }),
    ]),
    pre,
  ], { dataLang: label });
}

function transform(node) {
  if (!node.children) return;
  node.children = node.children.map((child) => {
    if (child.type !== 'element') return child;
    if (child.tagName === 'div' && child.properties?.dataCodeTitle != null) {
      const pre = child.children.find(isShikiPre);
      if (pre) return wrap(pre, String(child.properties.dataCodeTitle));
    }
    if (isShikiPre(child)) return wrap(child, null);
    transform(child);
    return child;
  });
}

export default function rehypeCodeWindow() {
  return (tree) => transform(tree);
}
