// GitHub / Obsidian 风格的提示块：
//   > [!TIP] 可选标题
//   > 内容
// 在类型后面加 - 或 + 会变成可折叠块（- 默认收起，+ 默认展开），比如 > [!HINT]-
import { visit } from 'unist-util-visit';

const MARKER = /^\[!(\w+)\]([+-]?)[ \t]*([^\n]*)(?:\n|$)/;

export default function remarkCallouts() {
  return (tree) => {
    visit(tree, 'blockquote', (node) => {
      const first = node.children[0];
      if (first?.type !== 'paragraph') return;
      const text = first.children[0];
      if (text?.type !== 'text') return;
      const m = MARKER.exec(text.value);
      if (!m) return;

      const type = m[1].toLowerCase();
      const fold = m[2];
      const title = m[3].trim() || (fold ? '点击展开' : '');

      text.value = text.value.slice(m[0].length);
      if (!text.value) first.children.shift();
      if (first.children.length === 0) node.children.shift();

      const collapsible = fold !== '';
      node.data = {
        hName: collapsible ? 'details' : 'div',
        hProperties: {
          className: ['callout', `callout-${type}`],
          'data-callout': type,
          ...(fold === '+' ? { open: true } : {}),
        },
      };
      node.children = [
        {
          type: 'calloutTitle',
          data: { hName: collapsible ? 'summary' : 'div', hProperties: { className: ['callout-title'] } },
          children: [
            {
              type: 'calloutLabel',
              data: { hName: 'span', hProperties: { className: ['callout-label'] } },
              children: [{ type: 'text', value: type.toUpperCase() }],
            },
            ...(title ? [{ type: 'text', value: title }] : []),
          ],
        },
        {
          type: 'calloutBody',
          data: { hName: 'div', hProperties: { className: ['callout-body'] } },
          children: node.children,
        },
      ];
    });
  };
}
