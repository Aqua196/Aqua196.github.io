// ```py title="exp.py"  —— 把 title 传给 rehype-code-window 显示在代码窗口标题栏
import { visit } from 'unist-util-visit';

const TITLE = /title=(?:"([^"]*)"|'([^']*)'|(\S+))/;

export default function remarkCodeTitle() {
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      const m = node.meta && TITLE.exec(node.meta);
      if (!m || !parent || index == null) return;
      parent.children[index] = {
        type: 'codeTitleWrapper',
        data: { hName: 'div', hProperties: { dataCodeTitle: m[1] ?? m[2] ?? m[3] } },
        children: [node],
      };
    });
  };
}
