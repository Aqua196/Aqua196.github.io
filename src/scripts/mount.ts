// 把粒子雕塑挂到页面上：首页和 404 页共用。
// 负责引擎之外的杂事：算布局、挑粒子数、WebGL2 不可用时的降级、跟随主题和尺寸变化、滚动吹散、离开页面时清理。
import { createSculpture, type Sculpture, type Target } from './particles';

export interface MountOptions {
  /** 整屏的画布 */
  stage: HTMLCanvasElement;
  /** 占位格：雕塑的中心和大小由它决定 */
  art: HTMLElement;
  targets?: Target[];
  /** 单位球半径占占位格短边的比例 */
  radius?: number;
  /** 往下滚的时候把雕塑吹散：传入用来计算进度的容器 */
  scatterOn?: HTMLElement;
  /** 没有 WebGL2 时，是否换成画在占位格里的 CPU 点刻版本（只支持曲面，不支持文字） */
  fallback?: boolean;
  onModel?: (index: number) => void;
  onStats?: (stats: { fps: number; count: number }) => void;
}

export async function mountSculpture(o: MountOptions): Promise<{ next: () => void; webgl: boolean; destroy: () => void } | null> {
  const { stage, art } = o;
  const layout = () => {
    const a = art.getBoundingClientRect();
    const c = stage.getBoundingClientRect();
    return { x: a.left + a.width / 2 - c.left, y: a.top + a.height / 2 - c.top, r: Math.min(a.width, a.height) * (o.radius ?? 0.56) };
  };
  // 小屏、低配设备少放一些粒子；引擎自己还会在掉帧时继续降
  const weak = innerWidth < 720 || (navigator.hardwareConcurrency ?? 8) <= 4;

  let ctrl: Pick<Sculpture, 'next' | 'refresh' | 'setScroll' | 'destroy'> | null = createSculpture(stage, {
    count: weak ? 70_000 : 160_000,
    targets: o.targets,
    // 调试用：网址带 ?hq 时不做自适应降画质
    adaptive: !new URLSearchParams(location.search).has('hq'),
    layout,
    onModel: o.onModel,
    onStats: o.onStats,
  });
  const webgl = !!ctrl;
  if (!ctrl) {
    stage.remove();
    if (!o.fallback) return null;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    art.prepend(canvas);
    const { createStipple } = await import('./stipple');
    ctrl = createStipple(canvas, { onModel: o.onModel });
    if (!ctrl) return null;
  }
  const c = ctrl;

  const box = o.scatterOn;
  const onScroll = () => box && c.setScroll((scrollY - box.offsetHeight * 0.12) / (box.offsetHeight * 0.75));
  if (box) {
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
  // 切换明暗主题、字体加载完导致布局变化后，重新取色和定位
  const themeWatch = new MutationObserver(c.refresh);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const sizeWatch = new ResizeObserver(c.refresh);
  sizeWatch.observe(art);
  if (webgl) sizeWatch.observe(stage);
  document.fonts?.ready.then(c.refresh);
  document.addEventListener('sculpture:next', c.next);

  return {
    next: c.next,
    webgl,
    destroy() {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('sculpture:next', c.next);
      themeWatch.disconnect();
      sizeWatch.disconnect();
      c.destroy();
    },
  };
}
