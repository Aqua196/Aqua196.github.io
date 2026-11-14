// ============================================================
//  指针跟随的小效果，全站共用一份事件委托（不给每个元素单独绑监听）：
//    [data-spot]      光斑：把指针位置写进 --mx / --my，CSS 用它画边框高光和内部柔光
//    [data-tilt]      卡片跟着指针微微倾斜（--rx / --ry）
//    [data-magnetic]  按钮被指针“吸”过去一点（--tx / --ty）
//  只在有鼠标的设备上启用；用户要求减弱动效时，倾斜和磁吸不做。
// ============================================================
const fine = matchMedia('(hover: hover) and (pointer: fine)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

let frame = 0;
let pending: PointerEvent | null = null;
let tilted: HTMLElement | null = null;
let pulled: HTMLElement | null = null;

function release(el: HTMLElement | null, props: string[]) {
  if (el) for (const p of props) el.style.removeProperty(p);
}

function apply() {
  frame = 0;
  const e = pending;
  if (!e) return;
  const target = e.target as Element | null;

  const spot = target?.closest?.<HTMLElement>('[data-spot]');
  if (spot) {
    const r = spot.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    spot.style.setProperty('--mx', `${x}px`);
    spot.style.setProperty('--my', `${y}px`);
    if (spot.hasAttribute('data-tilt') && !reduce.matches) {
      spot.style.setProperty('--ry', `${((x / r.width - 0.5) * 9).toFixed(2)}deg`);
      spot.style.setProperty('--rx', `${((0.5 - y / r.height) * 9).toFixed(2)}deg`);
      if (tilted !== spot) release(tilted, ['--rx', '--ry']);
      tilted = spot;
    }
  }
  if (tilted && tilted !== spot) {
    release(tilted, ['--rx', '--ry']);
    tilted = null;
  }

  const magnet = reduce.matches ? null : target?.closest?.<HTMLElement>('[data-magnetic]');
  if (magnet) {
    const r = magnet.getBoundingClientRect();
    magnet.style.setProperty('--tx', `${((e.clientX - r.left - r.width / 2) * 0.22).toFixed(1)}px`);
    magnet.style.setProperty('--ty', `${((e.clientY - r.top - r.height / 2) * 0.32).toFixed(1)}px`);
  }
  if (pulled && pulled !== magnet) release(pulled, ['--tx', '--ty']);
  pulled = magnet ?? null;
}

document.addEventListener(
  'pointermove',
  (e) => {
    if (!fine.matches) return;
    pending = e;
    frame ||= requestAnimationFrame(apply);
  },
  { passive: true },
);
// 指针移出窗口时把倾斜和磁吸放开
document.documentElement.addEventListener('pointerleave', () => {
  release(tilted, ['--rx', '--ry']);
  release(pulled, ['--tx', '--ty']);
  tilted = pulled = null;
});
