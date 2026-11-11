// 把粒子雕塑挂到页面上：首页和 404 页共用。
// 负责引擎之外的杂事：挑粒子数、跟随主题和尺寸变化、离开页面时清理。
// 浏览器不支持 WebGL2 时返回 null —— 页面上本来就有完整的文字内容，只是少了这层画面。
import { createSculpture, type Layout, type ParticleOptions, type Sculpture } from './particles';

export interface MountOptions extends Pick<ParticleOptions, 'targets' | 'auto' | 'clickNext' | 'onModel' | 'onStats'> {
  /** 铺满容器的画布 */
  stage: HTMLCanvasElement;
  /** 雕塑画在哪、画多大。每帧都会被调用，所以必须便宜（不要在里面读 DOM 布局） */
  layout: () => Layout;
  /** 尺寸、主题、字体变化后调用：重新量一遍 layout 依赖的东西 */
  measure?: () => void;
}

export function mountSculpture(o: MountOptions): (Sculpture & { destroy: () => void }) | null {
  // 小屏、低配设备少放一些粒子；引擎自己还会在掉帧时继续降
  const weak = innerWidth < 720 || (navigator.hardwareConcurrency ?? 8) <= 4;
  const ctrl = createSculpture(o.stage, {
    count: weak ? 70_000 : 160_000,
    targets: o.targets,
    auto: o.auto,
    clickNext: o.clickNext,
    // 调试用：网址带 ?hq 时不做自适应降画质
    adaptive: !new URLSearchParams(location.search).has('hq'),
    layout: o.layout,
    onModel: o.onModel,
    onStats: o.onStats,
  });
  if (!ctrl) {
    o.stage.remove();
    return null;
  }

  const refresh = () => {
    o.measure?.();
    ctrl.refresh();
  };
  // 切换明暗主题、字体加载完导致布局变化后，重新取色和定位
  const themeWatch = new MutationObserver(refresh);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const sizeWatch = new ResizeObserver(refresh);
  sizeWatch.observe(o.stage);
  document.fonts?.ready.then(refresh);
  window.addEventListener('resize', refresh);

  return {
    ...ctrl,
    refresh,
    destroy() {
      themeWatch.disconnect();
      sizeWatch.disconnect();
      window.removeEventListener('resize', refresh);
      ctrl.destroy();
    },
  };
}
