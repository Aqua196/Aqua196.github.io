// 把 Shiki 生成的 <pre> 包成一个带标题栏（文件名 / 语言 / 复制按钮）的代码窗口，
// 顺手做两件无障碍的事：把高亮配色的对比度校正到 WCAG AA，给任务列表的复选框补上名字。
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
      // 可见文字就是它的名字（读屏和语音控制都认这个），不另外写 aria-label
      h('button', ['code-copy'], [text('copy')], { type: 'button', title: '复制代码' }),
    ]),
    pre,
  ], { dataLang: label });
}

// ---------- 对比度 ----------
// 主题作者挑的颜色不一定够 4.5:1（vitesse 的注释和字符串就不够）。
// 这里只动亮度、不动色相：不够的颜色往远离背景的方向一点点推，够了就停。
const AA = 4.6; // 标准是 4.5，留一点余量给取整
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const parse = (hex) => {
  const v = hex.slice(1);
  const full = v.length === 3 ? [...v].map((c) => c + c).join('') : v.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
};
const format = (rgb) => '#' + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
const fixed = new Map();
function readable(hex, bgHex) {
  const key = hex + bgHex;
  if (!fixed.has(key)) {
    const bg = parse(bgHex);
    const toward = luminance(bg) > 0.5 ? 0 : 1; // 浅色背景往黑推，深色背景往白推
    let rgb = parse(hex);
    for (let i = 0; i < 50 && contrast(rgb, bg) < AA; i++) rgb = rgb.map((c) => c + (toward - c) * 0.04);
    fixed.set(key, format(rgb));
  }
  return fixed.get(key);
}
function fixContrast(node, bg) {
  if (node.type !== 'element') return;
  const style = node.properties?.style;
  if (node.tagName === 'span' && typeof style === 'string') {
    node.properties.style = style.replace(/--shiki-(light|dark):(#[0-9a-f]{3,8})/gi, (all, theme, hex) =>
      bg[theme] ? `--shiki-${theme}:${readable(hex.toLowerCase(), bg[theme])}` : all,
    );
  }
  node.children?.forEach((c) => fixContrast(c, bg));
}

// ---------- 任务列表 ----------
// GFM 的 `- [x] 做完了` 会生成一个光秃秃的 <input type="checkbox" disabled>，读屏只会念“复选框”
const textOf = (node) => (node.type === 'text' ? node.value : (node.children ?? []).map(textOf).join(''));
function labelTask(li) {
  const box = li.children.find((c) => c.type === 'element' && c.tagName === 'input');
  if (box) box.properties.ariaLabel = textOf(li).trim().slice(0, 80);
}

function transform(node, bg) {
  if (!node.children) return;
  node.children = node.children.map((child) => {
    if (child.type !== 'element') return child;
    if (child.tagName === 'li' && classList(child).includes('task-list-item')) labelTask(child);
    if (isShikiPre(child)) fixContrast(child, bg);
    if (child.tagName === 'div' && child.properties?.dataCodeTitle != null) {
      const pre = child.children.find(isShikiPre);
      if (pre) {
        fixContrast(pre, bg);
        return wrap(pre, String(child.properties.dataCodeTitle));
      }
    }
    if (isShikiPre(child)) return wrap(child, null);
    transform(child, bg);
    return child;
  });
}

/** @param {{ bg?: { light?: string; dark?: string } }} [options] 代码块在两套主题下的背景色，用来算对比度 */
export default function rehypeCodeWindow({ bg = {} } = {}) {
  return (tree) => transform(tree, bg);
}
